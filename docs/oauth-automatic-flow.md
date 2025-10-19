# OAuth Automatic Flow Implementation

## Overview

This document describes the transformation of the OAuth authentication system from a manual, tool-based flow to an automatic, session-based flow with seamless token exchange.

## Previous Implementation (Manual Flow)

### User Experience
1. User calls `auth_login` tool → receives URL, state, and codeVerifier
2. User visits URL in browser and completes authentication
3. OAuth bridge redirects to `/callback` → **"Cannot GET /callback" error**
4. User manually copies the callback URL with authorization code
5. User provides URL back to Claude
6. Claude extracts code and calls `auth_exchange` tool
7. Authentication complete

### Problems
- **Broken callback endpoint**: 404 error when redirected
- **Manual code extraction**: Required copy-pasting callback URL
- **Multi-step process**: Three separate tool calls needed
- **Poor user experience**: Confusing error messages and manual intervention

## New Implementation (Automatic Flow)

### User Experience
1. User calls `auth_login` tool → receives URL and sessionId
2. User visits URL in browser and completes authentication
3. OAuth bridge redirects to `/callback` → **automatic token exchange happens**
4. User sees success page: "✓ Authentication Successful!"
5. Claude polls `auth_status` with sessionId → receives tokens automatically
6. Authentication complete seamlessly

### Benefits
- **Working callback endpoint**: Beautiful success/error pages
- **Automatic token exchange**: No manual intervention needed
- **Session-based tracking**: Simple sessionId for everything
- **Token management**: Automatic refresh on API calls
- **Better UX**: Clear success confirmation and progress tracking

## Technical Implementation

### Session Management

**In-Memory Storage:**
```typescript
interface AuthSession {
    sessionId: string;
    codeVerifier: string;
    state: string;
    status: 'pending' | 'completed' | 'error';
    tokens?: {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
    };
    userInfo?: any;
    error?: string;
    createdAt: number;
    expiresAt: number;
}

const authSessions = new Map<string, AuthSession>();
```

**Session Lifecycle:**
- Created during `auth_login` with 5-minute TTL
- Updated to 'completed' when callback receives tokens
- Automatically cleaned up after expiration
- Cleanup runs every minute to remove expired sessions

### Callback Endpoint

**GET `/callback`** - Handles OAuth redirects

**Parameters:**
- `code`: Authorization code from OAuth bridge
- `state`: CSRF protection parameter
- `error`: Error code if authentication failed

**Flow:**
1. Validate state parameter matches session
2. Retrieve session by state to get codeVerifier
3. Exchange authorization code for tokens:
   ```typescript
   POST /token {
       grant_type: 'authorization_code',
       code,
       redirect_uri,
       client_id,
       code_verifier
   }
   ```
4. Retrieve user information with access token:
   ```typescript
   GET /userinfo
   Authorization: Bearer {accessToken}
   ```
5. Update session with tokens and user info
6. Display beautiful HTML success page

**Success Page Features:**
- Gradient background (purple to blue)
- User greeting with name
- Platform information
- "You can close this window" message
- Professional styling

**Error Page Features:**
- Red gradient background
- Error type and message
- Troubleshooting suggestions
- Support contact information

### Modified Tools

#### auth_login
**Changes:**
- Returns `sessionId` instead of `codeVerifier`
- Stores PKCE parameters in session
- Provides user-friendly instructions
- Tracks session state

**Output:**
```typescript
{
    authorizationUrl: string,
    sessionId: string,
    instructions: string
}
```

#### auth_status
**Enhanced Functionality:**

**Mode 1: Session Polling (new)**
```typescript
Input: { sessionId: string }
Output: {
    status: 'pending' | 'completed' | 'error',
    authenticated: boolean,
    tokens?: { ... },
    userInfo?: { ... },
    error?: string
}
```

**Mode 2: Token Validation (existing)**
```typescript
Input: { accessToken: string }
Output: {
    authenticated: boolean,
    userInfo?: { ... },
    expiresIn?: number
}
```

#### auth_exchange (DEPRECATED)
- No longer needed as callback handles exchange
- Kept temporarily for backward compatibility
- Will be removed in future version

### New Tools

#### api_call
**Purpose:** Make authenticated API calls with automatic token management

**Features:**
- Automatic token refresh on 401 errors
- Session expiry detection
- Retry logic for transient failures
- Support for all HTTP methods
- Query parameters and request body support

**Input:**
```typescript
{
    sessionId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: object,
    queryParams?: object
}
```

**Output:**
```typescript
{
    success: boolean,
    data: any,
    statusCode: number,
    error?: string
}
```

**Token Refresh Logic:**
1. Attempt API call with current access token
2. If 401 response, refresh access token:
   ```typescript
   POST /token {
       grant_type: 'refresh_token',
       refresh_token,
       client_id
   }
   ```
3. Update session with new tokens
4. Retry original API call once
5. If still fails, check session expiry:
   - Session expired → prompt re-authentication
   - Other error → return error to user

### Helper Functions

**refreshAccessToken(sessionId: string)**
- Exchanges refresh token for new access token
- Updates session with new tokens
- Returns boolean success status
- Handles refresh token expiration

**Session Cleanup**
- Runs every 60 seconds
- Removes sessions where `Date.now() > session.expiresAt`
- Logs cleanup operations in development mode

## Configuration

### Environment Variables

**Development:**
```bash
OAUTH_REDIRECT_URI=http://localhost:3000/callback
```

**Production:**
```bash
OAUTH_REDIRECT_URI=https://mcp.connectingib.com/callback
```

### nginx Configuration

The `/callback` endpoint must be properly proxied:

```nginx
location /callback {
    proxy_pass http://mcp_server;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Migration Guide

### For Existing Implementations

**Old Flow:**
```typescript
// Step 1: Login
const { authorizationUrl, codeVerifier, state } = await auth_login()
// Step 2: User visits URL and gets redirected with code
// Step 3: Manual code extraction
// Step 4: Exchange
const { accessToken } = await auth_exchange({ code, codeVerifier })
// Step 5: Use token
await auth_status({ accessToken })
```

**New Flow:**
```typescript
// Step 1: Login
const { authorizationUrl, sessionId } = await auth_login()
// Step 2: User visits URL - automatic exchange happens
// Step 3: Poll for completion
const { tokens, userInfo } = await auth_status({ sessionId })
// Step 4: Make API calls
const result = await api_call({ 
    sessionId, 
    method: 'GET', 
    path: '/api/v1/resources' 
})
```

### Breaking Changes

1. **auth_login output changed:**
   - Removed: `codeVerifier`, `state` (now internal)
   - Added: `sessionId`, `instructions`

2. **auth_exchange deprecated:**
   - No longer needed
   - Kept for backward compatibility
   - Will be removed in v2.0

3. **auth_status enhanced:**
   - Now accepts `sessionId` OR `accessToken`
   - Returns different outputs based on input

### Backward Compatibility

The implementation maintains backward compatibility:
- `auth_exchange` still works but shows deprecation warning
- `auth_status` with `accessToken` works as before
- Old flow can coexist with new flow during migration

## Testing

### Local Testing

1. **Start server:**
   ```bash
   npm run dev
   ```

2. **Test with MCP Inspector:**
   ```bash
   npx @modelcontextprotocol/inspector http://localhost:3000/mcp
   ```

3. **Complete OAuth flow:**
   - Call `auth_login`
   - Visit authorization URL in browser
   - Verify redirect to `http://localhost:3000/callback`
   - Confirm success page appears
   - Poll `auth_status` with sessionId
   - Verify tokens received

### Production Testing

1. **Deploy to production**
2. **Test with Claude Desktop:**
   - Configure: `https://mcp.connectingib.com/mcp`
   - Test complete OAuth flow
   - Verify automatic token exchange
   - Test API calls with `api_call` tool

## Security Considerations

### Session Security
- 5-minute session expiration prevents long-lived sessions
- State parameter validates callback authenticity
- PKCE prevents authorization code interception
- Automatic cleanup prevents memory leaks

### Token Security
- Access tokens expire after 1 hour
- Refresh tokens handled securely
- Tokens never exposed in URLs or logs
- Automatic refresh minimizes token exposure

### Production Hardening
- HTTPS required for callback endpoint
- CORS configured for allowed origins
- DNS rebinding protection enabled
- Session storage in memory (ephemeral)

## Future Enhancements

### Planned Improvements
1. **Persistent Session Storage**
   - Redis for multi-instance deployments
   - Session persistence across server restarts

2. **Enhanced Security**
   - Token encryption at rest
   - Session fingerprinting
   - IP-based session validation

3. **Monitoring**
   - Session metrics and analytics
   - Token refresh rate tracking
   - OAuth flow success rates

4. **Developer Experience**
   - Session debugging endpoints
   - OAuth flow visualization
   - Better error messages

## Troubleshooting

### "Cannot GET /callback" Error
**Cause:** Old version deployed without callback endpoint  
**Solution:** Deploy latest version with `/callback` GET handler

### Session Not Found
**Cause:** Session expired (> 5 minutes) or already used  
**Solution:** Call `auth_login` again to create new session

### Token Refresh Failed
**Cause:** Refresh token expired or invalid  
**Solution:** Re-authenticate with `auth_login` flow

### API Call Returns 401
**Cause:** Access token expired and refresh failed  
**Solution:** Check session status, may need re-authentication

## References

- **MCP SDK Documentation:** https://modelcontextprotocol.io
- **OAuth 2.0 with PKCE:** https://oauth.net/2/pkce/
- **IntelligenceBank OAuth Bridge:** ../ib-oauth-bridge-experimental/
- **Implementation:** src/index.ts lines 85-919

## Changelog

### Version 1.1.0 (Current)
- ✅ Implemented automatic OAuth callback handling
- ✅ Added session-based authentication tracking
- ✅ Created beautiful success/error pages
- ✅ Added `api_call` tool with auto-refresh
- ✅ Deprecated `auth_exchange` tool
- ✅ Enhanced `auth_status` for dual mode operation
- ✅ Added automatic token refresh logic
- ✅ Implemented session cleanup mechanism

### Version 1.0.0 (Previous)
- Manual OAuth flow with three tools
- No callback endpoint
- Client-managed PKCE parameters
- Manual code extraction required