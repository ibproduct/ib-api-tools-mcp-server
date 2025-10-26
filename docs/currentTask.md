# Current Task: File Handling Architecture for Remote MCP Server

## Status: ✅ Implementation Complete - Ready for Testing

## Overview

Addressing a critical file handling issue discovered during production testing of the compliance review tools. The current implementation fails when users upload files to Claude's interface due to a fundamental architecture mismatch between local and remote MCP servers.

---

## Problem Statement

### Critical Issue Discovered

The compliance review tool fails when used with Claude's file upload feature, causing conversations to become unusable.

#### Current Problematic Flow

1. User uploads a file (e.g., 1.6MB PDF) to Claude's interface
2. Claude provides a local file path: `/mnt/user-data/uploads/[AU]_MyBank.pdf`
3. User requests: "Please run a review for this file"
4. Claude calls our MCP tool [`run_file_compliance_review`](../src/tools/run-file-compliance-review.tool.ts:1) with the file path
5. **Problem**: Our remote EC2 server cannot access Claude's local filesystem at `/mnt/user-data/uploads/`
6. File upload to IntelligenceBank fails with `400 Bad Request`
7. **Critical Issue**: Claude attempts to recover by reading the file and converting it to base64 within the conversation
8. The base64 output (~2.1MB for a 1.6MB file) appears in the conversation history
9. This consumes ALL available context tokens, killing the conversation

#### Impact

- Conversations become unusable after attempting to process files
- Cannot complete compliance review workflows with uploaded files
- Severe user experience degradation
- Expected file sizes: 1.6MB typical, up to 50MB possible

### Root Cause Analysis

#### Architecture Mismatch

The issue stems from a fundamental mismatch between:
- **Local MCP Servers**: Can access files via filesystem paths
- **Remote MCP Servers** (our deployment): Cannot access client's local filesystem

Our current tool implementation accepts file paths as input ([`run-file-compliance-review.tool.ts:79-88`](../src/tools/run-file-compliance-review.tool.ts:79-88)), which works for local deployments but fails for remote deployments.

#### Why Base64 Conversion Fails

While our tool schema supports base64 content as an alternative, Claude (the LLM) currently:
1. First attempts to use the file path directly (fails on remote server)
2. Then converts the file to base64 within the conversation context (consumes all tokens)
3. The base64 string appears in conversation history, polluting context

For a 1.6MB file:
- Original size: 1.6MB
- Base64 encoded: ~2.1MB of text
- Token count: ~560,000 tokens (well beyond most context limits)

---

## Solution Options Analysis

### Option 1: MCP Resources with Blob Support ❌ Not Currently Feasible

Leverage the MCP protocol's resource system to handle binary data efficiently.

**Concept**:
```typescript
// Tool accepts resource URI instead of file content
{ file: "resource://claude-files/[AU]_MyBank.pdf" }

// MCP server requests the resource from Claude
const fileContent = await client.readResource("resource://claude-files/[AU]_MyBank.pdf");
```

**Advantages**:
- No base64 encoding in conversation context
- Efficient binary data transfer
- Follows MCP protocol standards
- Clean separation of concerns

**Disadvantages**:
- Requires MCP SDK and Claude to implement resource blob support
- Not currently available in MCP v1.20.1
- Would require waiting for protocol enhancement

**Status**: Not currently feasible - requires upstream protocol changes

---

### Option 2: Multipart Upload Endpoint ✅ Recommended

Add a dedicated file upload endpoint to our MCP server that accepts multipart/form-data, separate from the MCP tool protocol.

**Architecture**:
```
POST /upload (multipart/form-data)
  ↓
Server stores file temporarily with unique ID
  ↓
Returns: { fileId: "upload-abc123", filename: "doc.pdf", expiresAt: timestamp }
  ↓
run_file_compliance_review({ fileId: "upload-abc123", ... })
  ↓
Server retrieves file from temp storage
  ↓
Upload to IntelligenceBank
  ↓
Cleanup temp file
```

**Advantages**:
- ✅ Immediate implementation with existing technology
- ✅ No conversation context pollution
- ✅ Supports large files (up to 50MB+)
- ✅ Clean separation: upload ≠ processing
- ✅ Automatic cleanup of temporary files
- ✅ Works with current MCP protocol

**Disadvantages**:
- Requires two-step user flow (upload, then review)
- Adds complexity to tool usage
- Requires Claude to learn the two-step process
- File storage management needed

**Implementation Complexity**: Medium (1-2 days)

**Key Components**:
1. New endpoint: `POST /upload` with multer middleware
2. Temporary file storage: `/tmp/ib-mcp-uploads/`
3. File ID generation: Cryptographically random
4. Automatic cleanup: 5-minute TTL
5. Modified tool: Accept `fileId` OR base64 content

---

### Option 3: Streaming Multipart in Tool ❌ Doesn't Solve Core Issue

Accept base64 content in the tool but process it as a stream to avoid loading into memory.

**Status**: Not recommended - doesn't solve the core issue of context consumption. The base64 data would still appear in conversation history.

---

### Option 4: File Proxy Service ❌ Over-engineered

Create a separate file proxy service that Claude can access.

**Status**: Not recommended - too complex for current needs. Requires additional infrastructure and security considerations.

---

## Recommended Solution: Option 2 - Multipart Upload Endpoint

### Implementation Plan

**Phase 1: Add Upload Endpoint** (Day 1, 4 hours)
1. Install dependencies: `multer` for file upload handling
2. Create [`src/server/upload-handler.ts`](../src/server/upload-handler.ts:1)
3. Add `/upload` endpoint to Express server
4. Implement temporary file storage in `/tmp/ib-mcp-uploads/`
5. Implement file cleanup mechanism (5-minute TTL)
6. Add security measures:
   - File size limits (50MB max)
   - File type validation
   - Rate limiting
   - Unique, non-guessable file IDs

**Phase 2: Modify Compliance Review Tool** (Day 1, 3 hours)
1. Update tool input schema to accept `fileId` OR base64 content
2. Modify [`getFileInfo()`](../src/tools/run-file-compliance-review.tool.ts:299) to handle file ID lookups
3. Update tool description with upload instructions
4. Add file cleanup after successful upload to IntelligenceBank
5. Maintain backward compatibility with base64 input (for small files)

**Phase 3: Documentation and Testing** (Day 2, 4 hours)
1. Update [`README.md`](../README.md:1) with two-step workflow
2. Update tool descriptions with clear instructions
3. Add error handling for missing/expired files
4. Test with various file sizes (100KB, 1.6MB, 10MB, 50MB)
5. Document limitations and best practices
6. Update [`docs/codebaseSummary.md`](codebaseSummary.md:1)

### Updated Tool Interface

```typescript
// Option A: Upload first, then reference (Recommended for files >100KB)
const uploadResponse = await fetch('https://mcp.connectingib.com/upload', {
  method: 'POST',
  body: formData  // File from Claude's upload
});
const { fileId } = await uploadResponse.json();

// Then use in tool
run_file_compliance_review({
  sessionId: "session-id",
  fileId: fileId,  // Reference to uploaded file
  categorization: [...]
});

// Option B: Direct base64 (Backward compatibility for small files <100KB)
run_file_compliance_review({
  sessionId: "session-id",
  file: {
    content: "base64...",
    filename: "doc.pdf"
  },
  categorization: [...]
});
```

### Updated Tool Description

The tool description will be updated to include:

```
IMPORTANT - FILE UPLOAD FOR REMOTE SERVER:

This MCP server runs remotely and cannot access local file paths. 
Use one of these methods:

METHOD 1 (Recommended for files >100KB):
1. First upload the file to our server:
   POST https://mcp.connectingib.com/upload
   Content-Type: multipart/form-data
   
   Response: { "fileId": "upload-abc123", "filename": "doc.pdf", "expiresAt": 1234567890 }

2. Then reference the fileId in this tool:
   { "sessionId": "...", "fileId": "upload-abc123", ... }

METHOD 2 (For small files <100KB only):
Use base64 content directly:
{ "file": { "content": "base64...", "filename": "doc.pdf" }, ... }

DO NOT attempt to read local file paths or convert large files to base64 
in the conversation - this will consume all available context.
```

### File Upload Endpoint Specification

**Endpoint**: `POST /upload`

**Request**:
- Content-Type: `multipart/form-data`
- Field name: `file`
- Max size: 50MB
- Allowed types: PDF, DOC, DOCX, PNG, JPG, JPEG (configurable)

**Response** (Success - 200):
```json
{
  "fileId": "a1b2c3d4e5f6...",
  "filename": "MyBank.pdf",
  "size": 1638400,
  "expiresAt": 1234567890000
}
```

**Response** (Error - 400):
```json
{
  "error": "No file provided" | "File too large" | "Invalid file type"
}
```

**Response** (Error - 500):
```json
{
  "error": "Upload failed"
}
```

### Security Considerations

1. **File Size Limits**: 50MB maximum to prevent abuse
2. **File Type Validation**: Only allow document types
3. **Rate Limiting**: Prevent upload spam (to be implemented)
4. **Temporary Storage**: Files automatically deleted after 5 minutes
5. **No Persistent Storage**: No long-term file retention
6. **Unique File IDs**: Cryptographically random (32 bytes hex)
7. **No Directory Listing**: No way to enumerate uploaded files
8. **Access Control**: Files accessible only via their unique ID

### File Cleanup Strategy

- **TTL**: 5 minutes from upload time
- **Automatic Cleanup**: setTimeout triggers file deletion
- **Cleanup on Use**: File deleted after successful upload to IntelligenceBank
- **Cleanup on Error**: File remains for TTL (allows retry)
- **Server Shutdown**: All files cleaned up gracefully
- **Storage Location**: `/tmp/ib-mcp-uploads/` (auto-cleaned by OS)

---

## Migration Strategy

### Phase 1: Implementation (This Week)
- [x] Design solution architecture
- [x] Implement upload endpoint
- [x] Update compliance review tool
- [x] Add security measures
- [ ] Test end-to-end workflow
- [ ] Deploy to production

### Phase 2: Documentation (This Week)
- [ ] Update README with file upload workflow
- [ ] Create usage examples for two-step upload
- [ ] Document limitations and best practices
- [ ] Update codebase summary

### Phase 3: Monitoring (Next Week)
- [ ] Monitor upload endpoint usage
- [ ] Track file sizes and cleanup
- [ ] Identify any edge cases
- [ ] Optimize performance if needed
- [ ] Gather user feedback

---

## Future Considerations

### When MCP Protocol Supports Binary Resources

Once the MCP protocol adds native support for binary resources (planned feature):

1. Implement MCP resource handler for files
2. Update tool to accept resource URIs
3. Deprecate upload endpoint (or keep as fallback)
4. Update documentation
5. Maintain backward compatibility

### Potential Enhancements

- File upload progress tracking
- Support for multiple file uploads in single request
- File preview/validation before review
- Integration with cloud storage (S3) for larger files
- Direct streaming from client to IntelligenceBank (avoiding temporary storage)
- Caching of uploaded files across multiple reviews

---

## Next Steps

### Completed Actions
1. ✅ Installed `multer` dependency: `npm install multer @types/multer`
2. ✅ Created upload handler implementation ([`src/server/upload-handler.ts`](../src/server/upload-handler.ts:1))
3. ✅ Integrated into Express server setup ([`src/index.ts:109`](../src/index.ts:109))
4. ✅ Updated compliance review tool to accept `fileId` ([`src/tools/run-file-compliance-review.tool.ts:84`](../src/tools/run-file-compliance-review.tool.ts:84))
5. ✅ Added automatic file cleanup after successful use
6. ✅ Updated tool description with upload instructions

### Next Actions
1. Test locally with MCP Inspector
2. Test file upload workflow end-to-end
3. Verify file cleanup mechanisms
4. Deploy to production EC2 instance
5. Test with Claude desktop in production

### Testing Checklist
- [ ] Upload 100KB file successfully
- [ ] Upload 1.6MB file successfully
- [ ] Upload 10MB file successfully
- [ ] Upload 50MB file successfully
- [ ] Verify file cleanup after 5 minutes
- [ ] Test with expired file ID
- [ ] Test with invalid file ID
- [ ] Verify no context pollution in Claude conversation
- [ ] Complete end-to-end compliance review
- [ ] Test error scenarios

### Related Documentation

- **Current Implementation**: [`src/tools/run-file-compliance-review.tool.ts`](../src/tools/run-file-compliance-review.tool.ts:1)
- **Type Definitions**: [`src/types/compliance-review.types.ts`](../src/types/compliance-review.types.ts:1)
- **Server Setup**: [`src/server/express-setup.ts`](../src/server/express-setup.ts:1)
- **Deployment**: [`scripts/deploy.sh`](../scripts/deploy.sh:1)

---

## Previous Task: File Compliance Review Implementation ✅ Completed

Successfully implemented outcome-based file compliance review tools for the IntelligenceBank API Tools MCP Server.

### Implemented Features

#### 1. New MCP Tools

**get_compliance_filters** - Retrieves available category filters from IntelligenceBank API for use in compliance reviews.

**run_file_compliance_review** - Comprehensive outcome-based tool that handles the entire compliance review workflow.

#### 2. MCP Prompt Resource

**compliance_review_help** - Post-login guidance prompt that appears in Claude's interface.

### Deployment Details

- **Production Endpoint:** https://mcp.connectingib.com/mcp
- **Deployment Date:** October 26, 2025
- **Status:** Operational but blocked by file handling issue

### Key Design Decisions

1. **Outcome-Based Tool Pattern** - Single tool call for complete workflow
2. **Enhanced Tool Descriptions** - Detailed response format documentation
3. **Optional Category Filters** - Flexible categorization support
4. **Internal Polling** - Transparent status checking

### Testing Status

- ✅ TypeScript compilation successful
- ✅ Tool registration verified
- ✅ Deployed to production successfully
- ⏸️ End-to-end testing blocked by file handling issue

### Documentation

- **Design Pattern:** [`docs/design-options/outcome_tools_guide.md`](design-options/outcome_tools_guide.md:1)
- **Project Roadmap:** [`docs/projectRoadmap.md`](projectRoadmap.md:1)
- **Codebase Summary:** [`docs/codebaseSummary.md`](codebaseSummary.md:1)
- **Tech Stack:** [`docs/techStack.md`](techStack.md:1)