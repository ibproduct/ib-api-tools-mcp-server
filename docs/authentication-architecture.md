# Authentication Architecture

## Overview

The IntelligenceBank API Tools MCP server uses a **dual-authentication architecture** that combines OAuth 2.0 (for MCP protocol compliance) with IntelligenceBank's native session-based authentication (for API access).

## Authentication Flow

### 1. OAuth 2.0 Layer (MCP Compliance)

The MCP server implements OAuth 2.0 Authorization Code Flow with PKCE to comply with MCP protocol requirements:

```
User → MCP Server (auth_login)
  ↓
MCP Server → OAuth Bridge (/authorize)
  ↓
User authenticates via browser
  ↓
OAuth Bridge → MCP Server (callback with code)
  ↓
MCP Server → OAuth Bridge (/token with code_verifier)
  ↓
OAuth Bridge returns BOTH:
  - OAuth tokens (access_token, refresh_token)
  - IB session data (sid, clientid, apiV3url)
```

### 2. IntelligenceBank Session Layer (API Access)

The OAuth bridge transparently creates an IntelligenceBank session and returns the credentials:

- **sid**: IntelligenceBank session ID for direct API calls
- **clientid**: IB client identifier
- **apiV3url**: Base URL for the IB API instance
- **sidExpiry**: Unix timestamp when session expires
- **logintimeoutperiod**: Session validity in hours (1-120)

## Session Data Structure

### AuthSession Interface

```typescript
export interface AuthSession {
    sessionId: string;              // MCP session ID
    codeVerifier: string;           // PKCE parameter
    state: string;                  // CSRF protection
    clientId: string;               // OAuth client ID
    redirectUri: string;            // OAuth callback URL
    status: 'pending' | 'completed' | 'error';
    
    // OAuth tokens (for proxy mode)
    tokens?: {
        accessToken: string;        // Bearer token for OAuth bridge
        refreshToken: string;       // Token for session renewal
        tokenType: string;          // Always "Bearer"
        expiresIn: number;          // Token lifetime (seconds)
    };
    
    // IntelligenceBank session (for direct mode)
    ibSession?: {
        sid: string;                // IB session ID
        clientId: string;           // IB client ID (≠ OAuth clientId)
        apiV3url: string;           // IB API base URL
        logintimeoutperiod?: number; // Session hours (1-120)
        sidExpiry?: number;         // Unix timestamp
        sidCreatedAt?: number;      // Unix timestamp
    };
    
    userInfo?: any;                 // User profile from /userinfo
    error?: string;
    errorDescription?: string;
    createdAt: number;
    expiresAt: number;
}
```

## API Call Modes

The `api_call` tool supports two modes for making IntelligenceBank API requests:

### Proxy Mode (Default, Recommended)

Uses OAuth tokens to make requests through the OAuth bridge's `/proxy` endpoint:

**Advantages:**
- OAuth bridge handles IB authentication transparently
- Token refresh is managed automatically
- More secure (no direct credential exposure)
- Simpler for clients

**Usage:**
```json
{
  "sessionId": "abc123",
  "method": "GET",
  "path": "company.intelligencebank.com/api/3.0.0/BnK4JV/resource",
  "mode": "proxy"
}
```

**Request Flow:**
```
MCP Client → MCP Server
  ↓
MCP Server → OAuth Bridge (/proxy/company.ib.com/api/3.0.0/...)
  Header: Authorization: Bearer <access_token>
  ↓
OAuth Bridge → IntelligenceBank API
  Header: sid: <ib_session_id>
  ↓
Response flows back through the chain
```

### Direct Mode (Advanced)

Makes direct calls to the IntelligenceBank API using the `sid` header:

**Advantages:**
- More efficient (no proxy overhead)
- Full control over API requests
- Useful for debugging

**Disadvantages:**
- Requires managing IB session lifecycle
- Must handle session expiry directly
- More complex error handling

**Usage:**
```json
{
  "sessionId": "abc123",
  "method": "GET",
  "path": "/api/3.0.0/BnK4JV/resource",
  "mode": "direct"
}
```

**Request Flow:**
```
MCP Client → MCP Server
  ↓
MCP Server → IntelligenceBank API (direct)
  Header: sid: <ib_session_id>
  Header: Accept: application/json
  ↓
Response returned directly
```

## Token Refresh

When the OAuth access token expires, the MCP server automatically:

1. Detects 401 Unauthorized response
2. Calls OAuth bridge `/token` with `grant_type=refresh_token`
3. Receives new OAuth tokens AND updated IB session data
4. Updates the session with both sets of credentials
5. Retries the original API request

**Important:** Both OAuth tokens and IB session data are preserved/updated during refresh.

## Session Lifecycle

### OAuth Token Lifecycle
- **Expiry**: 1 hour (3600 seconds)
- **Refresh**: Automatic on 401 responses
- **Max Refreshes**: Configurable (OAuth bridge setting)

### IntelligenceBank Session Lifecycle
- **Expiry**: 1-120 hours (configurable per platform)
- **Refresh**: Renewed when OAuth token is refreshed
- **Timeout**: Session expires after `logintimeoutperiod` hours

### MCP Session Lifecycle
- **Creation**: When `auth_login` is called
- **TTL**: 5 minutes for pending sessions
- **Completion**: When OAuth callback succeeds
- **Cleanup**: Automatic cleanup of expired sessions

## Security Considerations

### OAuth Security
- PKCE (Proof Key for Code Exchange) prevents authorization code interception
- State parameter protects against CSRF attacks
- Short-lived access tokens (1 hour)
- Secure token storage (client responsibility)

### IntelligenceBank Session Security
- `sid` is a secure session identifier
- Session expiry enforced by IB platform
- Automatic cleanup on timeout
- HTTPS required for all API calls

### Best Practices
1. **Always use proxy mode** unless you have specific requirements for direct mode
2. **Never log or expose** `sid`, `access_token`, or `refresh_token` values
3. **Handle session expiry gracefully** by prompting for re-authentication
4. **Use HTTPS** for all production deployments
5. **Implement proper error handling** for both authentication modes

## Troubleshooting

### "Session not found or expired"
- User needs to call `auth_login` again
- MCP session has expired (5-minute TTL)

### "IntelligenceBank session data not available"
- OAuth bridge didn't return IB credentials
- Use proxy mode instead of direct mode
- Check OAuth bridge configuration

### "Authentication failed" (401)
- OAuth token expired and refresh failed
- IB session expired
- User needs to re-authenticate via `auth_login`

### "Invalid path format"
- Proxy mode: Include full domain (e.g., `company.ib.com/api/3.0.0/...`)
- Direct mode: Use API path only (e.g., `/api/3.0.0/...`)

## Implementation Details

### Key Files
- [`src/types/session.types.ts`](../src/types/session.types.ts): Session data structures
- [`src/auth/oauth-callback.ts`](../src/auth/oauth-callback.ts): OAuth callback handler (extracts both credential sets)
- [`src/auth/token-manager.ts`](../src/auth/token-manager.ts): Token refresh logic (preserves IB session data)
- [`src/tools/api-call.tool.ts`](../src/tools/api-call.tool.ts): Dual-mode API call implementation
- [`src/session/SessionManager.ts`](../src/session/SessionManager.ts): Session lifecycle management

### Configuration
```env
OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
OAUTH_CLIENT_ID=your-client-id
OAUTH_REDIRECT_URI=https://mcp.connectingib.com/callback
```

## Future Enhancements

- Automatic IB session renewal before expiry
- Session persistence across MCP server restarts
- Multiple concurrent IB sessions per user
- Advanced session analytics and monitoring
- Rate limiting per session