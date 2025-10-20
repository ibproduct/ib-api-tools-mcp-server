# Simplified Authentication Strategy

## Key Findings from OAuth Bridge Analysis

### 1. OAuth Token Refresh Returns the SAME sid
Looking at the OAuth bridge's `handleRefreshToken` function (lines 214-294 in token/index.ts):
- The refresh token handler uses the **STORED** IB session data from the original authentication
- It returns the **SAME** sid, clientid, and apiV3url (lines 279-283)
- The sid is NOT renewed during OAuth token refresh - it maintains the original session

### 2. Session Lifecycle
- **sid expiry**: Based on `logintimeoutperiod` (1-120 hours) from initial IB login
- **OAuth token expiry**: 1 hour (configurable)
- **Key insight**: The OAuth refresh does NOT extend the IB session - it only generates new OAuth tokens

### 3. Bridge Proxy Behavior
The OAuth bridge provides a `/proxy` endpoint that:
- Requires OAuth Bearer token for authorization
- Internally uses the stored sid associated with that OAuth token
- Acts as a passthrough to IntelligenceBank API

## Recommended Architecture

### Core Principles

1. **Use sid Directly for ALL API Calls**
   - Simpler, more efficient, no proxy overhead
   - Direct connection to IntelligenceBank API
   - No dependency on OAuth token validity for API calls

2. **OAuth Tokens for MCP Protocol Only**
   - Required for MCP authentication compliance
   - May be verified by MCP client across sessions
   - Keep refresh mechanism ONLY for MCP client verification

3. **Session Management**
   - Track sid expiry using `logintimeoutperiod`
   - On IB 401 error → Trigger full OAuth re-authentication
   - OAuth token refresh does NOT extend IB session

### Implementation Strategy

```typescript
// Simplified API Call Flow
1. Initial Authentication:
   OAuth Bridge → Returns OAuth tokens + IB sid
   Store both sets of credentials

2. API Calls:
   Always use sid directly with IB API
   No proxy mode, no OAuth token checks

3. Error Handling:
   401 from IB API → Full re-authentication required
   OAuth token expired → Refresh ONLY if MCP client requests verification

4. Token Refresh:
   Keep for MCP compliance only
   Does NOT renew IB session
   Returns same sid (no API benefit)
```

### Why Remove Proxy Mode?

1. **Unnecessary Complexity**: Proxy adds latency and potential failure points
2. **Same Session**: OAuth refresh returns the same sid, so no session benefit
3. **Direct is Simpler**: Using sid directly is more straightforward
4. **Better Error Handling**: Direct 401 responses from IB are clearer

### MCP Session Persistence

Based on MCP SDK architecture:
- MCP clients MAY persist OAuth tokens across chat sessions
- OAuth refresh endpoint MUST be available for token validation
- But actual API calls should use sid directly

### User Experience Implications

**For Users:**
- Single authentication flow (OAuth) at the start
- Session lasts based on IB timeout (up to 120 hours)
- Clear re-authentication prompt when session expires
- No confusing "proxy vs direct" choices

**For Developers:**
- Simpler codebase (one API call mode)
- Clear separation: OAuth for MCP, sid for IB
- Easier debugging (direct API responses)

## Refactoring Plan

1. **Remove Proxy Mode from api-call.tool.ts**
   - Use only direct IB API calls with sid
   - Simplify path handling

2. **Keep OAuth Refresh (but clarify purpose)**
   - Only for MCP protocol compliance
   - Document that it doesn't extend IB session
   - Don't use for API call retry logic

3. **Update 401 Error Handling**
   - Direct 401 from IB → Prompt for re-authentication
   - Don't attempt token refresh on API 401
   - Clear error messages about session expiry

4. **Update Documentation**
   - Explain OAuth is for MCP compliance only
   - Document sid-based API calling
   - Clarify session lifecycle

## Alternative Approach: Direct Browser Login

The user suggested an interesting alternative:
> "We could almost create a separate browser login tool that is used whenever a 401 is returned (and possibly never need the OAuth flow at all?)"

This would require:
- Bypassing MCP's OAuth requirement
- Direct browser-based IB login
- Manual sid extraction

However, this breaks MCP protocol compliance, so we should stick with OAuth for initial authentication but use sid for all subsequent API calls.