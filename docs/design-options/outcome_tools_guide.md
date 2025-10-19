# Outcome-Based Tools MCP Architecture - Technical Specification

## Overview

This document outlines an MCP server design where each tool represents a complete user outcome rather than a single API endpoint. Instead of creating 50 atomic tools or one generic meta-tool, we create 10-15 workflow-specific tools that handle entire multi-step processes internally.

---

## Core Principle

**One tool = One complete outcome**

Each tool encapsulates all the logic, API calls, polling, error handling, and orchestration needed to accomplish a specific user goal.

---

## Architecture Comparison

### Traditional Approach
```
create_user (tool) → POST /users
assign_groups (tool) → POST /users/{id}/groups  
verify_user (tool) → GET /users/{id}

User outcome requires: 3 tool calls orchestrated by LLM
```

### Outcome-Based Approach
```
setup_new_user (tool) → {
  internally: POST /users
  internally: POST /users/{id}/groups
  internally: GET /users/{id}
  returns: complete result
}

User outcome requires: 1 tool call
```

---

## Tool Design Pattern

### Tool Structure

Each outcome tool should have:

1. **Comprehensive Description**
   - What the tool accomplishes
   - When to use it
   - What it does internally (high-level)
   - Input requirements
   - Output format
   - Error scenarios

2. **Clear Input Schema**
   - All parameters needed for the entire workflow
   - Validation rules
   - Optional vs required fields
   - Examples

3. **Internal Implementation**
   - Complete orchestration logic
   - Multi-step API calls
   - Polling/waiting mechanisms
   - Error handling and recovery
   - Response formatting

---

## Example: Risk Review Tool

### Tool Definition

```typescript
{
  name: "risk_review",
  description: `
# Risk Review Tool

Performs a comprehensive content risk review.

## Purpose
Analyzes text or files for legal, brand, compliance, and safety risks before publication.

## What This Tool Does
1. Accepts text content or file path
2. Uploads file to IntelligenceBank if needed
3. Creates a review request with specified parameters
4. Polls for review completion (typically 10-30 seconds)
5. Returns structured risk assessment with findings

## When to Use
- User wants to check content for risks before publishing
- Need compliance, legal, or brand review
- Require risk scores and recommendations

## Input Parameters

**content_type** (required): "text" | "file"
- Specify whether you're reviewing text directly or a file

**content** (required): string
- If content_type is "text": the actual text to review
- If content_type is "file": the file path or file data

**review_params** (required): object
- **severity_threshold**: "low" | "medium" | "high"
  - Minimum severity level to include in results
- **categories**: array of strings
  - Which risk types to check: "legal", "brand", "compliance", "safety"
  - Default: all categories if not specified

## Output Format

Returns object with:
- review_id: string (for reference)
- overall_risk: "low" | "medium" | "high"
- approved: boolean (whether content passes threshold)
- findings: array of risk findings
  - category: string
  - severity: string
  - description: string
  - recommendation: string
- processing_time: number (seconds)

## Error Scenarios

- **File Upload Failed**: File format not supported or too large
- **Review Timeout**: Review takes longer than 60 seconds (rare)
- **Invalid Parameters**: Missing required fields or invalid values
- **API Error**: Service temporarily unavailable

## Example Usage

Input:
{
  "content_type": "text",
  "content": "Our new product launches next week with special pricing...",
  "review_params": {
    "severity_threshold": "medium",
    "categories": ["legal", "brand"]
  }
}

Output:
{
  "review_id": "rev_abc123",
  "overall_risk": "low",
  "approved": true,
  "findings": [],
  "processing_time": 12.5
}
  `,
  
  inputSchema: {
    type: "object",
    properties: {
      content_type: {
        type: "string",
        enum: ["text", "file"],
        description: "Whether reviewing text or a file"
      },
      content: {
        type: "string",
        description: "Text content or file path"
      },
      review_params: {
        type: "object",
        properties: {
          severity_threshold: {
            type: "string",
            enum: ["low", "medium", "high"],
            default: "medium"
          },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: ["legal", "brand", "compliance", "safety"]
            }
          }
        },
        required: ["severity_threshold"]
      }
    },
    required: ["content_type", "content", "review_params"]
  }
}
```

### Implementation Pseudocode

```typescript
async function risk_review(args) {
  let contentId;
  
  // Step 1: Handle content preparation
  if (args.content_type === "file") {
    try {
      const uploadResult = await uploadFile(args.content);
      contentId = uploadResult.fileId;
    } catch (error) {
      return {
        error: "File upload failed",
        details: error.message,
        suggestion: "Check file format and size limits"
      };
    }
  } else {
    contentId = args.content;
  }
  
  // Step 2: Create review request
  let reviewId;
  try {
    const reviewRequest = await createReview({
      content: contentId,
      contentType: args.content_type,
      threshold: args.review_params.severity_threshold,
      categories: args.review_params.categories || ["legal", "brand", "compliance", "safety"]
    });
    reviewId = reviewRequest.id;
  } catch (error) {
    return {
      error: "Review creation failed",
      details: error.message
    };
  }
  
  // Step 3: Poll for completion
  const startTime = Date.now();
  const maxWaitTime = 60000; // 60 seconds
  const pollInterval = 2000; // 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    const status = await getReviewStatus(reviewId);
    
    if (status.state === "complete") {
      const results = await getReviewResults(reviewId);
      return formatResults(results, Date.now() - startTime);
    }
    
    if (status.state === "failed") {
      return {
        error: "Review processing failed",
        details: status.error_message,
        review_id: reviewId
      };
    }
    
    await sleep(pollInterval);
  }
  
  // Timeout case
  return {
    error: "Review timeout",
    message: "Review is taking longer than expected",
    review_id: reviewId,
    suggestion: "Check status later using review_id"
  };
}

function formatResults(rawResults, processingTime) {
  return {
    review_id: rawResults.id,
    overall_risk: rawResults.overall_risk_level,
    approved: rawResults.approved,
    findings: rawResults.findings.map(f => ({
      category: f.category,
      severity: f.severity,
      description: f.description,
      recommendation: f.recommendation
    })),
    processing_time: processingTime / 1000
  };
}
```

---

## Identifying Outcome Tools

### Analysis Process

1. **List user goals** (not API endpoints)
   - "I want to review content for risks"
   - "I want to search and download assets"
   - "I want to create a new user with permissions"

2. **Map goals to API sequences**
   - Risk review: upload → create review → poll → results
   - Asset download: search → filter → download
   - User setup: create user → assign groups → set permissions → verify

3. **Group related operations**
   - If operations always happen together → single tool
   - If operations are sometimes independent → separate tools

4. **Define 10-15 core outcomes**
   - Most common workflows
   - Cover 80%+ of use cases

### Example Outcome Tool Set

1. **risk_review** - Review content for risks
2. **search_and_download_assets** - Find and download assets
3. **setup_new_user** - Create user with full configuration
4. **bulk_update_metadata** - Update metadata across multiple assets
5. **generate_usage_report** - Create and deliver analytics report
6. **migrate_assets** - Move assets between containers
7. **configure_permissions** - Set up group and user permissions
8. **archive_project** - Archive project with all assets
9. **duplicate_workflow** - Copy workflow configuration
10. **audit_access** - Review and report on access patterns

---

## Tool Implementation Guidelines

### 1. Error Handling

Each tool should handle errors gracefully:

```typescript
// Good error response
{
  error: "Upload failed",
  details: "File size exceeds 50MB limit",
  suggestion: "Compress file or split into smaller parts",
  partial_results: null
}

// Include context
{
  error: "Review timeout",
  review_id: "rev_123",
  suggestion: "Check status using review_id after a few minutes",
  elapsed_time: 60
}
```

### 2. Progress Feedback

For long-running operations, provide status updates:

```typescript
// Return intermediate status if possible
{
  status: "processing",
  step: "uploading_file",
  progress: 45,
  message: "Uploading file (2.3 MB of 5.1 MB)"
}
```

### 3. Validation

Validate inputs before making API calls:

```typescript
function validateRiskReviewInput(args) {
  if (!args.content || args.content.trim() === "") {
    return { valid: false, error: "Content cannot be empty" };
  }
  
  if (args.content_type === "file" && !fileExists(args.content)) {
    return { valid: false, error: "File not found at specified path" };
  }
  
  if (args.review_params.categories) {
    const validCategories = ["legal", "brand", "compliance", "safety"];
    const invalid = args.review_params.categories.filter(
      c => !validCategories.includes(c)
    );
    if (invalid.length > 0) {
      return { 
        valid: false, 
        error: `Invalid categories: ${invalid.join(", ")}` 
      };
    }
  }
  
  return { valid: true };
}
```

### 4. Retry Logic

Implement retry for transient failures:

```typescript
async function createReviewWithRetry(data, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createReview(data);
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  throw lastError;
}
```

### 5. Logging and Debugging

Log key operations for troubleshooting:

```typescript
async function risk_review(args) {
  const operationId = generateId();
  
  log.info(`[${operationId}] Starting risk review`, {
    content_type: args.content_type,
    categories: args.review_params.categories
  });
  
  try {
    // ... implementation
    log.info(`[${operationId}] Review complete`, { review_id: reviewId });
  } catch (error) {
    log.error(`[${operationId}] Review failed`, { error: error.message });
    throw error;
  }
}
```

---

## Configuration and Setup

### Environment Variables

```bash
# IntelligenceBank API Configuration
IB_API_BASE_URL=https://company.intelligencebank.com/api/v3
IB_CLIENT_ID=your_client_id
IB_CLIENT_SECRET=your_client_secret
IB_CONTAINER_ID=12345

# Tool Behavior Configuration
MAX_POLL_ATTEMPTS=30
POLL_INTERVAL_MS=2000
MAX_UPLOAD_SIZE_MB=50
REQUEST_TIMEOUT_MS=30000

# Logging
LOG_LEVEL=info
LOG_API_CALLS=true
```

### Tool Registry

```typescript
// tools/registry.ts
export const OUTCOME_TOOLS = {
  risk_review: {
    handler: riskReviewHandler,
    definition: riskReviewDefinition,
    enabled: true
  },
  search_and_download_assets: {
    handler: searchDownloadHandler,
    definition: searchDownloadDefinition,
    enabled: true
  },
  // ... other tools
};

// Allow dynamic enabling/disabling
export function registerTool(name, tool) {
  OUTCOME_TOOLS[name] = tool;
}

export function getEnabledTools() {
  return Object.entries(OUTCOME_TOOLS)
    .filter(([_, tool]) => tool.enabled)
    .map(([name, tool]) => ({ name, ...tool.definition }));
}
```

---

## Testing Strategy

### Unit Tests

Test each internal function:

```typescript
describe("risk_review tool", () => {
  describe("input validation", () => {
    it("rejects empty content", () => {
      const result = validateInput({ content: "" });
      expect(result.valid).toBe(false);
    });
    
    it("accepts valid text content", () => {
      const result = validateInput({
        content_type: "text",
        content: "Sample text",
        review_params: { severity_threshold: "medium" }
      });
      expect(result.valid).toBe(true);
    });
  });
  
  describe("result formatting", () => {
    it("formats API response correctly", () => {
      const formatted = formatResults(mockApiResponse, 12500);
      expect(formatted.processing_time).toBe(12.5);
      expect(formatted.findings).toHaveLength(2);
    });
  });
});
```

### Integration Tests

Test against real or mocked API:

```typescript
describe("risk_review integration", () => {
  it("completes full text review workflow", async () => {
    const result = await risk_review({
      content_type: "text",
      content: "Test content for review",
      review_params: {
        severity_threshold: "low",
        categories: ["legal"]
      }
    });
    
    expect(result.review_id).toBeDefined();
    expect(result.overall_risk).toMatch(/low|medium|high/);
    expect(result.approved).toBeDefined();
  });
  
  it("handles file upload workflow", async () => {
    const result = await risk_review({
      content_type: "file",
      content: "./test-files/sample.pdf",
      review_params: {
        severity_threshold: "medium",
        categories: ["brand", "compliance"]
      }
    });
    
    expect(result.error).toBeUndefined();
    expect(result.review_id).toBeDefined();
  });
});
```

### LLM Behavior Tests

Test with actual LLM to verify usability:

```typescript
// Pseudo-test for LLM interaction
describe("LLM usability", () => {
  it("LLM understands tool description", async () => {
    const llmResponse = await askLLM(
      "I need to review this text for legal risks: [text]",
      availableTools: [riskReviewTool]
    );
    
    expect(llmResponse.tool_call.name).toBe("risk_review");
    expect(llmResponse.tool_call.args.content_type).toBe("text");
  });
});
```

---

## Adding New Outcome Tools

### Process

1. **Identify the outcome**
   - What complete user goal does this accomplish?
   - What's the full workflow from start to finish?

2. **Map API calls**
   - List every API endpoint needed
   - Identify dependencies between calls
   - Note any polling or async operations

3. **Design input schema**
   - What does the user need to provide?
   - What can be handled automatically?
   - What are sensible defaults?

4. **Write comprehensive description**
   - When to use this tool
   - What it does (high-level steps)
   - Input requirements with examples
   - Output format with examples
   - Common error scenarios

5. **Implement handler**
   - Validate inputs
   - Execute API calls in sequence
   - Handle errors gracefully
   - Format results clearly

6. **Test thoroughly**
   - Unit tests for validation and formatting
   - Integration tests for full workflow
   - Error scenario tests
   - LLM usability tests

### Template

```typescript
// tools/my-new-outcome.ts

export const myNewOutcomeDefinition = {
  name: "my_new_outcome",
  description: `
# [Tool Name]

[Brief description of what this accomplishes]

## Purpose
[Detailed explanation]

## What This Tool Does
1. [Step 1]
2. [Step 2]
3. [Step 3]

## When to Use
- [Use case 1]
- [Use case 2]

## Input Parameters
[Detailed parameter descriptions]

## Output Format
[Expected output structure]

## Error Scenarios
[Common errors and how to handle them]

## Example Usage
[Input/output examples]
  `,
  
  inputSchema: {
    type: "object",
    properties: {
      // Define your schema
    },
    required: []
  }
};

export async function myNewOutcomeHandler(args) {
  // Validate inputs
  const validation = validateInput(args);
  if (!validation.valid) {
    return { error: validation.error };
  }
  
  try {
    // Step 1: [Description]
    const step1Result = await apiCall1(args);
    
    // Step 2: [Description]
    const step2Result = await apiCall2(step1Result);
    
    // Step 3: [Description]
    const finalResult = await apiCall3(step2Result);
    
    return formatOutput(finalResult);
    
  } catch (error) {
    return handleError(error);
  }
}

function validateInput(args) {
  // Validation logic
}

function formatOutput(data) {
  // Format for user
}

function handleError(error) {
  // Error handling
}
```

---

## Advantages and Trade-offs

### Advantages

1. **Simplified LLM Interaction**
   - Single tool call instead of orchestrating multiple calls
   - LLM doesn't need to manage state between calls
   - Reduced chance of incorrect sequencing

2. **Better Error Handling**
   - Sophisticated retry logic in tool implementation
   - Contextual error messages
   - Recovery from transient failures

3. **Performance**
   - No round-trips to LLM between API calls
   - Internal polling without external coordination
   - Optimized execution flow

4. **Reliability**
   - Controlled orchestration logic
   - Tested workflows
   - Predictable behavior

5. **Clear Abstractions**
   - Each tool maps to user mental model
   - Easy to discover appropriate tool
   - Self-documenting through descriptions

### Trade-offs

1. **Less Flexible**
   - Can't easily compose tools in novel ways
   - Adding new workflows requires code changes
   - Not suitable for exploratory API usage

2. **More Upfront Work**
   - Each workflow requires implementation
   - Testing is more involved
   - More code to maintain

3. **Deployment Required**
   - Changes require server redeployment
   - Can't update workflows with just markdown
   - Code-level changes for modifications

### When This Approach Works Best

- 10-20 well-defined user outcomes
- Complex multi-step workflows
- Polling or waiting required
- Sophisticated error handling needed
- Consistent user patterns
- Production reliability is critical

---

## Hybrid Approach: Adding Generic Tool

For flexibility, include a generic API call tool alongside outcome tools:

```typescript
{
  name: "api_call",
  description: "Make a direct API call for operations not covered by outcome tools",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      endpoint: { type: "string" },
      body: { type: "object" }
    }
  }
}
```

**Use outcome tools for**: Common workflows (80% of usage)  
**Use generic tool for**: Edge cases, exploration, power users (20% of usage)

---

## File Structure

```
mcp-server/
├── src/
│   ├── server.ts              # Main MCP server setup
│   ├── config.ts              # Configuration
│   ├── tools/
│   │   ├── registry.ts        # Tool registration
│   │   ├── risk-review.ts     # Risk review outcome tool
│   │   ├── search-download.ts # Search & download outcome tool
│   │   ├── setup-user.ts      # User setup outcome tool
│   │   └── generic-api.ts     # Generic API call tool
│   ├── api/
│   │   ├── client.ts          # HTTP client wrapper
│   │   ├── auth.ts            # Authentication handling
│   │   └── endpoints.ts       # API endpoint helpers
│   └── utils/
│       ├── validation.ts      # Input validation
│       ├── formatting.ts      # Output formatting
│       └── errors.ts          # Error handling utilities
├── tests/
│   ├── unit/
│   ├── integration/
│   └── llm-behavior/
├── package.json
└── tsconfig.json
```

---

## Development Timeline

### Phase 1: Foundation (Week 1-2)
- [ ] Set up MCP server structure
- [ ] Implement authentication
- [ ] Create 2 outcome tools
- [ ] Basic error handling
- [ ] Test with Claude Desktop

### Phase 2: Core Tools (Week 2-4)
- [ ] Implement 6-8 core outcome tools
- [ ] Comprehensive testing
- [ ] Error handling refinement
- [ ] Documentation for each tool

### Phase 3: Polish (Week 4-6)
- [ ] Add remaining outcome tools
- [ ] Implement generic API tool
- [ ] Performance optimization
- [ ] Production deployment preparation

---

## Conclusion

The outcome-based tools approach provides a practical balance between flexibility and reliability. Each tool encapsulates a complete workflow, handling all the complexity internally while presenting a simple interface to the LLM. This results in more reliable execution, better error handling, and a clearer user experience compared to either atomic tools or pure meta-tools.