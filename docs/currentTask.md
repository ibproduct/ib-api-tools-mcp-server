# Current Task: Simplify Authentication Architecture

## Context
The generic API call tool was mixing up authentication concepts, attempting to use OAuth session IDs for IntelligenceBank API calls when it should use IntelligenceBank's native session credentials (sid).

## Research Findings

### MCP Documentation (modelcontextprotocol.io)

#### Core Authentication Concepts
- **Token Storage**: MCP hosts (like Claude Desktop) are responsible for storing OAuth tokens securely (e.g., using system keychains)
- **Token Refresh**: Hosts automatically refresh tokens when they expire
- **Session Persistence**: Tokens can persist across chat sessions via secure storage
- **Authorization**: Host attaches tokens via `Authorization: Bearer <token>` header

#### OAuth Flow in MCP (from authorization tutorial)
- **Server Provides**: `authorizationUrl`, `tokenUrl`, `scope` in server metadata
- **Client Handles**: Opening browser, exchanging code for tokens, refreshing tokens
- **Automatic Headers**: MCP client adds `Authorization: Bearer <token>` to all requests
- **Token Validation**: Server can validate tokens on incoming requests
- **Session Persistence**: OAuth tokens MAY persist across chat sessions via secure storage

### OAuth Bridge Analysis
- **Token Refresh Returns SAME sid**: When refreshing OAuth tokens, the bridge returns the existing IB session, NOT a new one
- **sid Lifecycle**: Based on `logintimeoutperiod` (1-120 hours), independent of OAuth token expiry
- **No Session Extension**: OAuth refresh does NOT extend the IB session

## Architecture Decision

### Use sid Directly for ALL API Calls
- OAuth tokens are ONLY for MCP protocol compliance
- All IntelligenceBank API calls use `sid` header directly
- Remove proxy mode entirely - it adds unnecessary complexity

### Rationale
1. **Simpler**: Direct API calls with sid are more straightforward
2. **Same Session**: OAuth refresh returns same sid, so no benefit to proxy
3. **Better Performance**: No proxy overhead
4. **Clearer Errors**: Direct 401 responses from IB

## Refactoring Plan

### Step 1: Simplify api-call.tool.ts ✅ (Already completed in previous work)
- Remove `mode` parameter 
- Use only direct IB API calls with sid
- Ensure proper error messages when sid unavailable

### Step 2: Update Token Refresh Logic
- Keep OAuth refresh for MCP compliance ONLY
- Document that it doesn't extend IB session
- Don't use for API call retry logic

### Step 3: Fix 401 Error Handling
- On 401 from IB API → Prompt full re-authentication
- Don't attempt token refresh on API 401
- Clear message: "Session expired. Please authenticate again using auth_login"

### Step 4: Update Documentation
- Update authentication-architecture.md
- Clarify OAuth is for MCP compliance only
- Document sid-based API calling
- Update README.md

## Implementation Status

### Completed
- [x] AuthSession interface includes IB session data
- [x] OAuth callback extracts both OAuth tokens and IB credentials
- [x] api-call.tool.ts supports both proxy and direct modes
- [x] Research MCP SDK authentication documentation
- [x] Analyze OAuth bridge token refresh behavior

### Ready to Implement
1. **Refactor api-call.tool.ts**
   - Remove `mode` parameter completely
   - Use ONLY direct IB API calls with sid
   - Remove all proxy-related code paths

2. **Clarify Token Refresh Purpose**
   - Keep OAuth refresh endpoint functional
   - Document it's ONLY for MCP client token validation
   - Note that it returns same sid (no IB session extension)

3. **Fix 401 Error Handling**
   - On IB API 401 → Return clear "session expired" message
   - Instruct user to re-authenticate with auth_login
   - Do NOT attempt OAuth token refresh for API 401s

4. **Update Documentation**
   - Merge authentication-architecture.md with simplified approach
   - Remove references to proxy mode from README
   - Update tool descriptions

### Important Considerations

**Q: What happens when MCP client validates OAuth token across sessions?**
A: The MCP client may store and validate OAuth tokens. We must keep token refresh working for this purpose, but it has NO effect on IB session validity.

**Q: When does the sid expire?**
A: Based on `logintimeoutperiod` from initial IB login (1-120 hours). OAuth refresh does NOT extend this.

**Q: Why not use proxy mode at all?**
A: Proxy adds latency, complexity, and obscures errors. Since OAuth refresh returns the same sid, there's no session management benefit. Direct calls are simpler and clearer.

## Session Management Summary

```
Initial Auth:
  OAuth Bridge → OAuth tokens (for MCP) + IB sid (for API)
  
API Calls:
  Always use sid directly with IB API
  
Token Refresh:
  Keep for MCP compliance
  Returns same sid (no API benefit)
  
On 401 Error:
  Full re-authentication required
  OAuth bridge will generate new sid