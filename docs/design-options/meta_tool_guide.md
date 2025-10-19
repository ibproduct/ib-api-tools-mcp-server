# Meta-Tool MCP Architecture - Technical Specification

## Executive Summary

This document outlines a revolutionary approach to MCP server design that eliminates tool proliferation by using a **meta-tool architecture**. Instead of creating individual tools for each API endpoint, we create a single generic tool that can dynamically call any endpoint, guided by declarative workflow documents.

**Key Insight**: The LLM becomes a dynamic API orchestrator, not a static tool caller.

---

## Problem Statement

Traditional MCP implementations face several challenges:

1. **Tool Explosion**: 50 API endpoints = 50 tools = significant maintenance burden
2. **Tight Coupling**: API changes require code changes and redeployment
3. **Limited Context**: Tool descriptions can't convey complex workflows
4. **Poor Discoverability**: Users struggle to find the right tool for their goal
5. **Redundant Code**: Similar tools share 90% of their implementation

---

## Solution: Meta-Tool Architecture

### Core Principle

**Replace N endpoint-specific tools with 1 generic tool + N declarative workflow guides.**

The LLM reads workflow documentation to understand:
- What information is needed
- Which API calls to make
- How to sequence operations
- How to handle errors

Then uses a generic API call tool to execute the operations.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
│  (User selects outcome via MCP Prompts)                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Workflow Layer (MCP Resources)              │
│  - Agent MD files define workflows                           │
│  - Declarative: what to do, not how to do it               │
│  - Human-readable markdown                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              API Documentation Layer (MCP Tool)              │
│  - Provides OpenAPI-style specifications                     │
│  - LLM queries this to learn parameter schemas              │
│  - Separate from workflow logic                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Execution Layer (MCP Tool)                      │
│  - Single generic_api_call tool                             │
│  - Handles any HTTP method, any endpoint                    │
│  - Authentication, error handling, response parsing         │
└─────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    IntelligenceBank API                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. MCP Prompts (Outcome Selection)

**Purpose**: Allow users to select their desired outcome from a curated list.

**Implementation**:
- Use MCP `ListPromptsRequestSchema` and `GetPromptRequestSchema`
- Each prompt represents a high-level user goal
- Prompts automatically load their corresponding Agent MD resource

**Schema**:
```json
{
  "prompts": [
    {
      "name": "create_user_account",
      "description": "Create a new user account in IntelligenceBank",
      "arguments": []
    },
    {
      "name": "search_and_download_assets",
      "description": "Find and download digital assets",
      "arguments": []
    }
  ]
}
```

**When GetPrompt is called**:
- Return a message that includes the agent resource URI
- This automatically loads the workflow guide for the LLM

---

### 2. Agent MD Resources (Workflow Guides)

**Purpose**: Provide step-by-step workflow instructions to the LLM.

**Format**: Markdown documents exposed via MCP Resources

**URI Scheme**: `agent://{workflow_name}`

**Required Sections**:

#### a. Objective
Clear statement of what this workflow accomplishes.

#### b. Required Information
List of data points needed from the user:
```markdown
## Required Information
- email: User's email address (string, format: email)
- firstName: User's first name (string)
- lastName: User's last name (string)

## Optional Information
- groupIds: Array of group IDs to assign (array of strings)
- roleId: Role ID for permissions (string)
```

#### c. API Call Sequence
Step-by-step list of API calls:
```markdown
## API Call Sequence

### Step 1: Create User
**Endpoint**: POST /api/v3/{containerID}/users
**API Reference**: POST /users
**Required Parameters**: email, firstName, lastName
**Response Data Needed**: userId (for next step)

### Step 2: Assign to Groups (if groupIds provided)
**Endpoint**: POST /api/v3/{containerID}/users/{userId}/groups
**API Reference**: POST /users/{userId}/groups
**Required Parameters**: userId (from Step 1), groupIds
**Conditional**: Only execute if user provided groupIds

### Step 3: Verify Creation
**Endpoint**: GET /api/v3/{containerID}/users/{userId}
**API Reference**: GET /users/{userId}
**Purpose**: Confirm user was created successfully
```

#### d. Error Handling
How to handle common errors:
```markdown
## Error Handling

- **409 Conflict (User Exists)**: Ask user if they want to update the existing user instead
- **404 Not Found (Group)**: List available groups and ask user to select valid ones
- **400 Bad Request**: Check which field failed validation, ask user to correct
- **401 Unauthorized**: Authentication failed, initiate re-auth flow
```

#### e. Success Criteria
What defines successful completion:
```markdown
## Success Criteria
- User created (HTTP 201)
- Groups assigned (if specified)
- User data verified via GET request
- User receives confirmation with userId
```

**Implementation**:
- Store agent MD files in a `workflows/` directory
- Expose via `ListResourcesRequestSchema` and `ReadResourceRequestSchema`
- Files should be human-readable and easily editable by non-developers

---

### 3. API Documentation Tool

**Purpose**: Provide detailed API specifications on-demand.

**Tool Name**: `lookup_api_spec`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "api_reference": {
      "type": "string",
      "description": "API reference (e.g., 'POST /users', 'GET /assets/{id}')"
    }
  },
  "required": ["api_reference"]
}
```

**Output Format**:
```markdown
# API Specification: POST /users

**Endpoint**: /api/v3/{containerID}/users
**Method**: POST
**Description**: Create a new user account

## Path Parameters
- **containerID** (string) *required*: Organization container ID

## Body Parameters
- **email** (string) *required*: User email address (format: email)
- **firstName** (string) *required*: User's first name
- **lastName** (string) *required*: User's last name
- **password** (string) optional: User password (auto-generated if omitted)
- **roleId** (string) optional: Role ID for permissions

## Response Codes
- **201**: User created successfully
  - Returns: `{ userId: string, email: string, createdAt: string }`
- **400**: Invalid parameters
  - Returns: `{ error: string, fields: string[] }`
- **409**: User already exists
  - Returns: `{ error: string, existingUserId: string }`

## Example Request
{
  "email": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Data Source Options**:

1. **Hardcoded Specs**: Store in TypeScript/JSON objects in the MCP server
2. **OpenAPI Import**: Load from `openapi.yaml` or `swagger.json`
3. **Dynamic Scraping**: Parse from API documentation website
4. **Hybrid**: Core endpoints hardcoded, extended endpoints loaded dynamically

**Recommended**: Start with hardcoded specs for critical endpoints, expand over time.

---

### 4. Generic API Call Tool

**Purpose**: Execute any HTTP API call with dynamic parameters.

**Tool Name**: `generic_api_call`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "method": {
      "type": "string",
      "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"],
      "description": "HTTP method"
    },
    "endpoint": {
      "type": "string",
      "description": "API endpoint path (e.g., '/api/v3/{containerID}/users')"
    },
    "path_params": {
      "type": "object",
      "description": "Path parameters as key-value pairs",
      "additionalProperties": { "type": "string" }
    },
    "query_params": {
      "type": "object",
      "description": "Query string parameters as key-value pairs",
      "additionalProperties": true
    },
    "body": {
      "type": "object",
      "description": "Request body for POST/PUT/PATCH (JSON)"
    },
    "headers": {
      "type": "object",
      "description": "Additional headers (auth handled automatically)",
      "additionalProperties": { "type": "string" }
    }
  },
  "required": ["method", "endpoint"]
}
```

**Responsibilities**:

1. **URL Construction**:
   - Replace path parameters: `{containerID}` → actual value
   - Append query parameters: `?limit=10&offset=0`
   - Validate URL format

2. **Authentication**:
   - Inject OAuth tokens from session
   - Handle token refresh if needed
   - Support multiple auth schemes (Bearer, Basic, API Key)

3. **Request Execution**:
   - Set appropriate headers (`Content-Type`, `Accept`)
   - Send request via `fetch()` or `axios`
   - Handle timeouts and retries

4. **Response Handling**:
   - Parse JSON responses
   - Handle non-JSON responses (files, HTML, etc.)
   - Extract and return relevant data

5. **Error Handling**:
   - Parse error responses
   - Return structured error information
   - Suggest corrective actions when possible

**Output Format**:
```json
{
  "content": [{
    "type": "text",
    "text": "**API Call Result**\n\n**Status**: 201 Created\n\n**Response**:\n```json\n{\n  \"userId\": \"usr_abc123\",\n  \"email\": \"john@example.com\"\n}\n```"
  }]
}
```

**Security Considerations**:
- Whitelist allowed base URLs
- Sanitize user input in parameters
- Never expose raw error traces containing sensitive data
- Log API calls for audit purposes

---

### 5. Optional: List Available APIs Tool

**Purpose**: Help LLM discover available endpoints.

**Tool Name**: `list_available_apis`

**Input**: None

**Output**:
```markdown
# Available API Endpoints

## User Management
- **POST /users**: Create a new user account
- **GET /users/{userId}**: Retrieve user details
- **PUT /users/{userId}**: Update user information
- **DELETE /users/{userId}**: Delete a user account
- **POST /users/{userId}/groups**: Assign user to groups

## Asset Management
- **GET /assets/search**: Search for assets
- **GET /assets/{assetId}**: Get asset details
- **GET /assets/{assetId}/download**: Download asset file
- **PATCH /assets/{assetId}/metadata**: Update asset metadata

Use lookup_api_spec with any reference to get detailed specifications.
```

---

## LLM Orchestration Flow

### Step-by-Step Execution

**Phase 1: Initialization**
1. User selects outcome via MCP prompt
2. Corresponding Agent MD resource loads automatically
3. LLM reads the entire workflow guide

**Phase 2: API Discovery**
1. LLM identifies required API calls from the guide
2. For each API reference (e.g., "POST /users"):
   - Calls `lookup_api_spec("POST /users")`
   - Reads parameter schemas, types, constraints
   - Understands request/response format

**Phase 3: Information Gathering**
1. LLM compares required info from agent guide vs. available info
2. Asks user for missing required parameters
3. Validates user input against API spec constraints
4. Confirms optional parameters with user

**Phase 4: Execution**
1. For each step in the API sequence:
   - Constructs `generic_api_call` with gathered parameters
   - Executes the call
   - Stores response data (especially IDs for subsequent calls)
   - Checks for errors and handles per agent guide

**Phase 5: Completion**
1. Verifies success criteria from agent guide
2. Reports results to user
3. Offers next steps or related workflows

---

## Authentication Integration

### Recommended Approach: OAuth 2.0 Flow

**Tools Required**:

1. **auth_login**: Initiates OAuth flow
   - Returns authorization URL for user
   - Returns session ID for tracking

2. **auth_status**: Checks OAuth completion
   - Input: session ID
   - Returns: tokens when auth complete

3. **generic_api_call** uses stored tokens:
   - Retrieves access token from session
   - Adds `Authorization: Bearer {token}` header
   - Handles 401 by refreshing token

**Session Management**:
- Store tokens in MCP server state
- Associate tokens with session/user
- Implement token refresh logic
- Clear tokens on explicit logout or expiry

---

## Configuration Structure

### Server Configuration File

```typescript
// config.ts
export const CONFIG = {
  // Base API settings
  api: {
    baseUrl: "https://company.intelligencebank.com",
    version: "v3",
    timeout: 30000, // 30 seconds
    retryAttempts: 3
  },
  
  // OAuth settings
  oauth: {
    clientId: process.env.IB_CLIENT_ID,
    clientSecret: process.env.IB_CLIENT_SECRET,
    redirectUri: "http://localhost:3000/oauth/callback",
    scopes: ["read", "write", "admin"]
  },
  
  // Workflow settings
  workflows: {
    directory: "./workflows",
    autoReload: true // reload MDs without restart
  },
  
  // API documentation
  apiDocs: {
    source: "openapi", // or "hardcoded" or "url"
    path: "./openapi.yaml"
  }
};
```

---

## File Structure

```
mcp-server/
├── src/
│   ├── server.ts              # Main MCP server
│   ├── config.ts              # Configuration
│   ├── tools/
│   │   ├── generic-api-call.ts    # Generic API execution
│   │   ├── lookup-api-spec.ts     # API documentation lookup
│   │   └── auth.ts                # OAuth tools
│   ├── workflows/
│   │   ├── create-user-account.md
│   │   ├── search-download-assets.md
│   │   ├── bulk-update-metadata.md
│   │   └── index.ts               # Workflow loader
│   ├── api-specs/
│   │   ├── openapi.yaml           # or
│   │   └── specs.ts               # Hardcoded specs
│   └── utils/
│       ├── http-client.ts         # HTTP wrapper
│       ├── auth-manager.ts        # Token management
│       └── url-builder.ts         # URL construction
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development Priorities

### Phase 1: Foundation (Week 1-2)
1. Set up basic MCP server structure
2. Implement `generic_api_call` tool with hardcoded auth
3. Create 1-2 simple agent MD files
4. Test with Claude Desktop

### Phase 2: API Documentation (Week 2-3)
1. Implement `lookup_api_spec` tool
2. Add API specs for core endpoints (10-15 endpoints)
3. Support OpenAPI import (if specs available)
4. Test LLM's ability to read and use specs

### Phase 3: OAuth & Auth (Week 3-4)
1. Implement OAuth flow tools
2. Add token management and refresh
3. Integrate auth into `generic_api_call`
4. Test full auth flow

### Phase 4: Workflow Expansion (Week 4-6)
1. Create agent MDs for all major use cases
2. Refine based on user testing
3. Add error handling refinements
4. Document workflow creation process

### Phase 5: Production Readiness (Week 6-8)
1. Add logging and monitoring
2. Error handling and retry logic
3. Performance optimization
4. Security audit
5. User documentation

---

## Testing Strategy

### Unit Tests
- Test URL construction with various parameter combinations
- Test auth token injection and refresh
- Test error response parsing

### Integration Tests
- Test against IntelligenceBank API sandbox
- Verify OAuth flow end-to-end
- Test each agent workflow manually

### LLM Behavior Tests
- Provide Claude with agent guides and verify it follows steps
- Test information gathering (does it ask for required fields?)
- Test error handling (does it respond appropriately to API errors?)
- Test multi-step workflows (does it pass data between calls?)

### User Acceptance Tests
- Have non-technical users try each workflow
- Verify prompts are clear and discoverable
- Ensure error messages are actionable

---

## System Prompt Recommendations

**Critical**: The MCP client (Claude Desktop, etc.) should include this system prompt:

```markdown
# Meta-Tool API Orchestration Protocol

When using the IntelligenceBank MCP server, follow this pattern:

## Workflow Execution Pattern

1. **User selects outcome via prompt**
   - An Agent MD guide loads automatically
   - Read the ENTIRE guide before proceeding

2. **Learn API specifications**
   - For each API call mentioned in the guide
   - Use `lookup_api_spec("API_REFERENCE")` to get full details
   - Note required vs optional parameters, types, and formats

3. **Gather required information**
   - Check what the agent guide requires
   - Ask user for any missing information
   - Validate against API spec constraints
   - Confirm optional parameters

4. **Execute API calls in sequence**
   - Use `generic_api_call` for each operation
   - Follow the exact order specified in guide
   - Store response data (especially IDs) for subsequent calls
   - Check success before continuing to next step

5. **Handle errors per guide**
   - Follow error handling patterns in agent guide
   - Ask user for clarification when needed
   - Don't make assumptions

## Critical Rules

✅ **ALWAYS**:
- Read entire agent guide before starting
- Look up API specs before making calls
- Ask for all required information upfront
- Execute calls in the order specified
- Pass response data between calls (e.g., userId from step 1 to step 2)
- Report errors clearly with suggested actions

❌ **NEVER**:
- Skip reading the agent guide
- Make API calls without looking up specs
- Guess parameter types or names
- Execute calls out of sequence
- Continue after a failed call (unless guide says to)
- Make assumptions about what user meant

## State Tracking

Keep track of:
- Current step in workflow sequence
- Response data from previous API calls (especially IDs)
- Information collected from user
- Any errors encountered

This ensures smooth workflow execution and good user experience.
```

---

## Advantages Over Traditional Approach

| Aspect | Traditional MCP | Meta-Tool MCP |
|--------|----------------|---------------|
| **Tool Count** | N endpoints = N tools | N endpoints = 1 tool |
| **Adding Endpoint** | Write code, deploy | Write markdown |
| **API Changes** | Code changes required | Update specs/docs |
| **Workflow Updates** | Code changes | Edit markdown |
| **Maintenance** | High (code in multiple places) | Low (declarative files) |
| **Discoverability** | Tool descriptions only | Full workflow guides |
| **Context** | Limited by tool description | Rich markdown documentation |
| **Flexibility** | Rigid, pre-defined paths | Dynamic orchestration |
| **Learning Curve** | Low (simple tools) | Medium (read guides) |
| **Non-Dev Changes** | Impossible | Easy (edit markdown) |

---

## Potential Challenges & Solutions

### Challenge 1: LLM Doesn't Follow Guide
**Solution**: 
- Refine agent guide to be more explicit
- Add examples in the guide
- Improve system prompt instructions
- Test with different temperature settings

### Challenge 2: API Spec Too Complex
**Solution**:
- Simplify spec output format
- Highlight most important parameters
- Add usage examples in specs
- Create "common patterns" section in guides

### Challenge 3: Error Messages Confusing
**Solution**:
- Parse API errors into human-readable format
- Add "what this means" and "how to fix" sections
- Include error examples in agent guides

### Challenge 4: Multi-Step State Management
**Solution**:
- Explicitly tell LLM to store response data
- Add state tracking reminders in guides
- Use clear variable names in examples
- Test complex workflows thoroughly

### Challenge 5: Authentication Expired
**Solution**:
- Implement transparent token refresh
- Catch 401 and auto-refresh before retry
- Notify user only if re-auth needed
- Add auth troubleshooting guide

---

## Success Metrics

### Technical Metrics
- **Tool Efficiency**: 1 generic tool vs. 50+ specific tools
- **Code Maintenance**: Lines of code for adding new workflow
- **API Coverage**: % of API endpoints usable via generic tool
- **Error Rate**: % of API calls that fail vs. succeed

### User Experience Metrics
- **Workflow Completion Rate**: % of users who complete workflows
- **Time to Completion**: Average time for common tasks
- **Support Tickets**: Reduction in support requests
- **User Satisfaction**: NPS or satisfaction scores

### Development Metrics
- **Time to Add Workflow**: Hours to add new agent guide
- **Non-Dev Contributions**: % of workflow updates by non-devs
- **Deployment Frequency**: How often server needs redeployment

---

## Future Enhancements

### Phase 2 Features
1. **Workflow Composition**: Chain multiple agents together
2. **Conditional Logic**: If/else branches in agent guides
3. **Parallel Execution**: Run multiple API calls concurrently
4. **Caching**: Cache API specs and responses
5. **Analytics**: Track which workflows are most used

### Advanced Features
1. **Natural Language Workflows**: Generate agent guides from descriptions
2. **Learning System**: Improve guides based on success/failure patterns
3. **A/B Testing**: Test different guide variations
4. **Visual Workflow Builder**: GUI for creating agent guides
5. **Multi-API Support**: Orchestrate across multiple APIs

---

## Conclusion

The meta-tool architecture represents a paradigm shift in MCP server design:

**From**: "A tool for every endpoint"  
**To**: "A tool for any endpoint, guided by declarative workflows"

This approach provides:
- ✅ **Scalability**: Add workflows without code
- ✅ **Maintainability**: Update via markdown edits
- ✅ **Flexibility**: Handle any API dynamically
- ✅ **Clarity**: Workflows are human-readable
- ✅ **Efficiency**: Minimal code, maximum capability

The LLM becomes an intelligent orchestrator that reads documentation, gathers information, and executes complex multi-step workflows—all without hardcoded tools for every operation.

---

## Getting Started Checklist

- [ ] Set up basic MCP server structure
- [ ] Implement `generic_api_call` tool
- [ ] Create first agent MD file
- [ ] Test with Claude Desktop
- [ ] Add `lookup_api_spec` tool
- [ ] Add API specs for 5 core endpoints
- [ ] Implement OAuth flow
- [ ] Create 3-5 common workflow guides
- [ ] User test workflows
- [ ] Refine based on feedback
- [ ] Deploy to production

**Estimated Timeline**: 6-8 weeks for full implementation

---

## Support & Questions

For questions about this architecture:
1. Review example implementations in attached artifacts
2. Test with simplified versions first
3. Iterate based on LLM behavior
4. Refine guides based on user feedback

**Key Philosophy**: Start simple, expand gradually, keep it declarative.