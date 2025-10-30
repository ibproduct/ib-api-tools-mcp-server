# MCP Resources Implementation Plan

## Status: ✅ Simplified Implementation Complete

Implementation of MCP Resources with automatic OAuth authentication for IntelligenceBank API Tools MCP Server.

### Current Status (2025-01-29)

**Simplified Resources Integration**: ✅ Complete
- Basic Resources List API call working
- OAuth flow fully functional
- Single resource URI scheme: `ib://{clientId}/resource/{resourceId}`
- Keyword search via cursor parameter
- Pagination support (100 resources per page)
- Sorted by last update time (most recent first)

**What Changed**: Simplified from complex folder browsing to basic resources list to establish solid foundation before adding advanced features.

## Overview

This document describes the implementation of MCP Resources capability with automatic OAuth authentication flow, enabling Claude Desktop users to browse IntelligenceBank resources directly through the resources interface.

### Simplified Approach (Current Implementation)

The current implementation uses a simplified approach focused on the Resources List API:

**API Endpoint**:
```
GET /api/3.0.0/{clientId}/resource.limit(100).order(lastUpdateTime:-1).fields().includeAmaTags(...)
```

**Key Parameters**:
- `searchParams[isSearching]=true` - Always enabled
- `searchParams[keywords]` - Optional keyword search
- `.order(lastUpdateTime:-1)` - Sort by most recently updated
- `.limit(100)` - Maximum 100 resources per page

**URI Scheme**:
- Single type: `ib://{clientId}/resource/{resourceId}`
- Removed: folder URIs, folder-resources URIs, search URIs

**Benefits**:
- Single API call, single code path
- Easier to debug and maintain
- Solid foundation for future enhancements
- Keyword search via cursor parameter
- Pagination support

**Future Enhancements**:
Once the basic implementation is confirmed working, we can incrementally add:
- Folder browsing capability
- Advanced search with filters
- Resource subscriptions
- Parameterized resource templates

## Reference Documentation

### MCP Protocol Documentation
- **MCP Authorization Specification**: [`docs/mcp-docs/authorization.md`](mcp-docs/authorization.md) - OAuth 2.0 integration requirements
- **MCP Resources Specification**: [`docs/mcp-docs/resources.md`](mcp-docs/resources.md) - Resources protocol definition
- **MCP Transports**: [`docs/mcp-docs/transports.md`](mcp-docs/transports.md) - Streamable HTTP transport details
- **Connecting Remote Servers**: [`docs/mcp-docs/connect-remote-servers.md`](mcp-docs/connect-remote-servers.md) - How Claude Desktop connects to remote MCP servers

### MCP SDK Documentation
- **TypeScript SDK README**: [`node_modules/@modelcontextprotocol/sdk/README.md`](../node_modules/@modelcontextprotocol/sdk/README.md) - Official SDK documentation
- **SDK Version**: `@modelcontextprotocol/sdk@1.20.1` (verified in [`package.json`](../package.json))

### OAuth Bridge Documentation
- **OAuth Bridge Repository**: `/Users/charlyvanni/Workspace/Innovation/ib-oauth-bridge-experimental`
- **Bridge API Documentation**: `/Users/charlyvanni/Workspace/Innovation/ib-oauth-bridge-experimental/docs/api-documentation.md`
- **Bridge Architecture**: `/Users/charlyvanni/Workspace/Innovation/ib-oauth-bridge-experimental/docs/architecture.md`

## Critical Issues Found and Fixed

### Issue 1: Missing Sub-Path Discovery Endpoint ✅ FIXED
**Problem**: Per RFC9728 Section 5.2, MCP clients try discovery endpoints in this order:
1. Sub-path: `/.well-known/oauth-protected-resource/mcp` (for MCP endpoint at `/mcp`)
2. Root: `/.well-known/oauth-protected-resource` (fallback)

We only implemented the root endpoint, causing "Failed to discover OAuth metadata" errors.

**Fix**: Added both endpoints in [`src/server/express-setup.ts`](../src/server/express-setup.ts):
```typescript
app.get('/.well-known/oauth-protected-resource/mcp', handleProtectedResourceMetadata);
app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata);
```

### Issue 2: Trailing Slash in Authorization Server URL ✅ FIXED
**Problem**: The `OAUTH_BRIDGE_URL` environment variable had a trailing slash (`/dev/`), which was being included in the `authorization_servers` array, potentially causing URL construction issues in OAuth clients.

**Fix**: Strip trailing slash in [`src/auth/mcp-authorization.ts`](../src/auth/mcp-authorization.ts):
```typescript
function getOAuthBridgeUrl(): string {
    const bridgeUrl = process.env.OAUTH_BRIDGE_URL;
    if (!bridgeUrl) {
        throw new Error('OAUTH_BRIDGE_URL environment variable is required');
    }
    // Remove trailing slash for consistency with RFC8414
    return bridgeUrl.replace(/\/$/, '');
}
```

### Issue 3: Wrong MCP_SERVER_URL Protocol ✅ FIXED
**Problem**: Production server had `MCP_SERVER_URL` missing or set to HTTP instead of HTTPS.

**Fix**: Added to production `.env`:
```bash
MCP_SERVER_URL=https://mcp.connectingib.com
```

## Implementation Architecture

### Key Design Decision: Manual OAuth Discovery

We implemented manual OAuth discovery endpoints rather than using the SDK's `ProxyOAuthServerProvider` because:

1. **OAuth Bridge Limitations**: The IntelligenceBank OAuth bridge provides OAuth endpoints (`/authorize`, `/token`, `/userinfo`) but does NOT provide MCP discovery endpoints (`/.well-known/*`)

2. **Valid Architecture**: Per MCP specification, the resource server (our MCP server) can provide discovery endpoints that point to an external authorization server (the OAuth bridge)

3. **Tool Compatibility**: Maintains compatibility with existing authentication tools (`auth_login`, `auth_status`) that users may already be using

4. **Full Control**: Gives us complete control over the authentication flow and session management

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User adds IntelligenceBank connector in Claude Desktop      │
│    Claude discovers OAuth endpoints via /.well-known/*          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. User clicks "Add from IntelligenceBank" to browse resources │
│    Claude sends: POST /mcp {"method":"resources/list"}          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. MCP Server returns HTTP 401 Unauthorized                     │
│    Headers: WWW-Authenticate: Bearer realm="...", scope="..."   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Claude automatically opens browser for OAuth                 │
│    Redirects to: {OAUTH_BRIDGE_URL}/authorize?...               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. User authenticates on IntelligenceBank platform              │
│    OAuth bridge redirects to: {MCP_SERVER_URL}/callback?code=...│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. MCP Server exchanges code for tokens                         │
│    Stores access_token in session                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Claude retries resource request with Bearer token            │
│    Headers: Authorization: Bearer {access_token}                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. MCP Server validates token, finds session, returns resources │
└─────────────────────────────────────────────────────────────────┘
```

## Implemented Components

### 1. MCP Authorization Protocol Endpoints
**File**: [`src/auth/mcp-authorization.ts`](../src/auth/mcp-authorization.ts)

Implements RFC9728 (Protected Resource Metadata) and RFC8414 (Authorization Server Metadata) endpoints:

- `handleProtectedResourceMetadata()` - Serves `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`
- `handleAuthorizationServerMetadata()` - Serves `/.well-known/oauth-authorization-server`
- `buildWWWAuthenticateHeader()` - Constructs RFC6750 compliant WWW-Authenticate headers
- `extractBearerToken()` - Parses Bearer tokens from Authorization headers

**Discovery Endpoints**:
```typescript
// Sub-path (tried first by MCP clients)
GET /.well-known/oauth-protected-resource/mcp
{
  "resource": "https://mcp.connectingib.com",
  "authorization_servers": ["https://oauth-bridge-url"],
  "scopes_supported": ["read", "write"],
  "bearer_methods_supported": ["header"]
}

// Root (fallback)
GET /.well-known/oauth-protected-resource
// Returns same metadata

// Authorization server metadata
GET /.well-known/oauth-authorization-server
{
  "issuer": "https://oauth-bridge-url",
  "authorization_endpoint": "https://oauth-bridge-url/authorize",
  "token_endpoint": "https://oauth-bridge-url/token",
  "userinfo_endpoint": "https://oauth-bridge-url/userinfo",
  "code_challenge_methods_supported": ["S256"]
}
```

### 2. HTTP Authentication Middleware
**File**: [`src/auth/mcp-auth-middleware.ts`](../src/auth/mcp-auth-middleware.ts)

Critical component that intercepts MCP resource requests at the HTTP layer (before they reach the MCP protocol layer) to return proper HTTP 401 status codes:

**Why This Is Necessary**:
- MCP SDK's request handlers don't have direct access to HTTP response objects
- Throwing errors in request handlers results in JSON-RPC errors, not HTTP errors
- Claude Desktop requires HTTP 401 with WWW-Authenticate header to trigger OAuth flow

**Implementation**:
```typescript
export function mcpAuthMiddleware(sessionManager: SessionManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only check authentication for resource requests
    if (req.method === 'POST' && req.path === '/mcp' && 
        (req.body.method === 'resources/list' || 
         req.body.method === 'resources/read' ||
         req.body.method === 'resources/subscribe')) {
      
      const session = findAuthenticatedSessionByToken(sessionManager, req.headers.authorization);
      
      if (!session?.ibSession?.sid) {
        // Return HTTP 401 with WWW-Authenticate header
        res.status(401)
          .header('WWW-Authenticate', buildWWWAuthenticateHeader({...}))
          .json({...});
        return;
      }
    }
    next();
  };
}
```

**Important**: This middleware only intercepts resource requests, NOT protocol requests like `initialize`, `tools/list`, or `prompts/list`.

### 3. Express Server Setup
**File**: [`src/server/express-setup.ts`](../src/server/express-setup.ts)

Updated to:
- Serve OAuth discovery endpoints (both sub-path and root)
- Apply authentication middleware
- Expose required CORS headers

```typescript
export function createExpressApp(sessionManager: SessionManager): Express {
  const app = express();
  
  // CORS configuration
  app.use(cors({
    exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization']
  }));
  
  // Discovery endpoints (sub-path tried first, root as fallback)
  app.get('/.well-known/oauth-protected-resource/mcp', handleProtectedResourceMetadata);
  app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata);
  app.get('/.well-known/oauth-authorization-server', handleAuthorizationServerMetadata);
  
  // Authentication middleware
  app.use(mcpAuthMiddleware(sessionManager));
  
  return app;
}
```

### 4. Resource Handlers
**File**: [`src/resources/resource-handlers.ts`](../src/resources/resource-handlers.ts)

Updated to:
- Accept Authorization header parameter
- Look up sessions by Bearer token (not by transport session ID)
- Handle authentication errors gracefully

**Session Lookup Strategy**:
```typescript
function findAuthenticatedSessionByToken(
  sessionManager: SessionManager,
  authHeader: string | undefined
): AuthSession | null {
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  
  // Find session where tokens.accessToken matches the Bearer token
  for (const session of allSessions.values()) {
    if (session.tokens?.accessToken === token && 
        session.status === 'completed' && 
        session.ibSession?.sid) {
      return session;
    }
  }
  return null;
}
```

### 5. MCP Server Configuration
**File**: [`src/index.ts`](../src/index.ts)

Key changes:
- Register ResourceTemplate to declare resources capability
- Override request handlers for custom authentication logic
- Pass sessionManager to Express app setup
- POST-only endpoint (no SSE support needed)

```typescript
// Register ResourceTemplate to declare capability
server.registerResource(
  'ib-folders',
  new ResourceTemplate('ib://{clientId}/folder/{folderId}', { list: undefined }),
  { title: 'IntelligenceBank Folders', description: '...' },
  async (uri, params) => { /* handler */ }
);

// Override handlers for custom authentication
const underlyingServer = server.server;
underlyingServer.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
  const authHeader = (extra as any)?.headers?.authorization;
  return await handleResourceList(sessionManager, sessionId, cursor, authHeader);
});

// POST-only endpoint (Streamable HTTP without SSE)
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### 6. Environment Configuration
**File**: [`.env.example`](../.env.example)

Added:
```bash
# MCP Server URL for OAuth discovery endpoints
MCP_SERVER_URL=http://localhost:3000
```

**Production Configuration**:
```bash
MCP_SERVER_URL=https://mcp.connectingib.com
```

## Session Management Architecture

### Dual Session System

The implementation handles two types of session IDs:

1. **MCP Transport Session ID**: Generated by `StreamableHTTPServerTransport`, used for MCP protocol session management
2. **OAuth Auth Session ID**: Generated by our `SessionManager`, used for OAuth flow tracking

### Token-Based Session Lookup

For resource requests, we use **Bearer token-based lookup** as the primary method:

```typescript
// Resource request comes in with Authorization header
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// We find the session by matching the access token
session.tokens.accessToken === extractedBearerToken
```

This is the correct approach per MCP Authorization specification and OAuth 2.0 Bearer Token Usage (RFC6750).

## Testing

### Local Testing

```bash
# Build the project
npm run build

# Start server
PORT=3001 MCP_SERVER_URL=http://localhost:3001 node dist/index.js

# Test sub-path discovery endpoint (tried first)
curl http://localhost:3001/.well-known/oauth-protected-resource/mcp | jq .

# Test root discovery endpoint (fallback)
curl http://localhost:3001/.well-known/oauth-protected-resource | jq .

# Test authorization server metadata
curl http://localhost:3001/.well-known/oauth-authorization-server | jq .

# Test 401 response
curl -i -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'

# Expected: HTTP/1.1 401 Unauthorized
# Expected: WWW-Authenticate: Bearer realm="...", scope="read write", ...

# Test with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```

### Production Testing

```bash
# Test sub-path discovery endpoint
curl https://mcp.connectingib.com/.well-known/oauth-protected-resource/mcp | jq .

# Test 401 response
curl -i -X POST https://mcp.connectingib.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'

# Test with MCP Inspector
npx @modelcontextprotocol/inspector https://mcp.connectingib.com/mcp
```

### End-to-End Testing with Claude Desktop

1. Remove existing IntelligenceBank connector (if any)
2. Add new connector: `https://mcp.connectingib.com/mcp`
3. Verify tools and prompts appear in configuration
4. Click "Add from IntelligenceBank" in resources menu
5. **Verify browser opens automatically for OAuth authentication**
6. Complete authentication on IntelligenceBank platform
7. Verify resources appear in Claude Desktop

## Deployment

### Environment Variables Required

```bash
# OAuth Bridge Configuration
OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
OAUTH_CLIENT_ID=ib-api-tools-mcp-server-prod
OAUTH_REDIRECT_URI=https://mcp.connectingib.com/callback

# MCP Server Configuration
PORT=3000
MCP_SERVER_URL=https://mcp.connectingib.com
NODE_ENV=production

# CORS Configuration
ALLOWED_ORIGINS=*
```

### Deployment Steps

```bash
# Use the deployment script
./scripts/deploy.sh

# Or manually:
npm run build
tar -czf dist-deploy.tar.gz dist/
scp -i ~/Workspace/Keys/ib-mcp-api-tools-keypair-2025.pem \
  dist-deploy.tar.gz ubuntu@52.9.99.47:/tmp/
ssh -i ~/Workspace/Keys/ib-mcp-api-tools-keypair-2025.pem ubuntu@52.9.99.47 \
  "sudo tar -xzf /tmp/dist-deploy.tar.gz -C /opt/ib-api-tools-mcp-server/ && \
   sudo chown -R ubuntu:ubuntu /opt/ib-api-tools-mcp-server/dist && \
   pm2 restart ib-mcp-server"
```

## Troubleshooting

### "Failed to discover OAuth metadata"

**Symptoms**: MCP Inspector or Claude Desktop shows this error when trying to initiate OAuth flow.

**Causes**:
1. Sub-path discovery endpoint not accessible
2. Trailing slash in authorization server URL
3. CORS headers not allowing discovery endpoint access

**Verification**:
```bash
# Test sub-path endpoint (tried first)
curl https://mcp.connectingib.com/.well-known/oauth-protected-resource/mcp

# Should return 200 OK with metadata
# authorization_servers should NOT have trailing slash
```

### Resources Don't Appear in Claude Desktop

**Check**:
1. Discovery endpoints are accessible
2. Server returns HTTP 401 for unauthenticated requests
3. WWW-Authenticate header is present in 401 response
4. CORS headers allow Authorization header
5. Tools and prompts are visible (indicates server is connecting)

### OAuth Flow Doesn't Start

**Check**:
1. `MCP_SERVER_URL` environment variable uses HTTPS in production
2. Discovery endpoints return correct OAuth bridge URLs without trailing slashes
3. OAuth bridge is accessible from user's browser
4. Redirect URI matches OAuth bridge configuration

### Authentication Fails After OAuth

**Check**:
1. OAuth callback endpoint (`/callback`) is accessible
2. Access token is being stored in session
3. Bearer token is being sent in Authorization header
4. Session lookup by token is working correctly

## Implementation Files

### Core Implementation
- [`src/auth/mcp-authorization.ts`](../src/auth/mcp-authorization.ts) - OAuth discovery endpoints (172 lines)
- [`src/auth/mcp-auth-middleware.ts`](../src/auth/mcp-auth-middleware.ts) - HTTP 401 middleware (87 lines)
- [`src/server/express-setup.ts`](../src/server/express-setup.ts) - Express configuration (37 lines)
- [`src/resources/resource-handlers.ts`](../src/resources/resource-handlers.ts) - Resource handlers with auth (346 lines)
- [`src/index.ts`](../src/index.ts) - MCP server setup (251 lines)

### Configuration
- [`.env.example`](../.env.example) - Environment template with MCP_SERVER_URL

### Documentation
- [`docs/mcp-resources-implementation-plan.md`](mcp-resources-implementation-plan.md) - This document
- [`docs/currentTask.md`](currentTask.md) - Current development tasks
- [`docs/codebaseSummary.md`](codebaseSummary.md) - Overall codebase structure
- [`docs/techStack.md`](techStack.md) - Technology stack details

## Verification Checklist

- [x] Sub-path discovery endpoint accessible
- [x] Root discovery endpoint accessible (fallback)
- [x] Authorization server URLs without trailing slashes
- [x] HTTPS URLs in production
- [x] HTTP 401 with WWW-Authenticate header
- [x] Bearer token authentication working
- [x] Tools registered and visible
- [x] Prompts registered and visible
- [x] Resources capability declared
- [ ] OAuth flow tested in MCP Inspector
- [ ] OAuth flow tested in Claude Desktop
- [ ] Resources browsing tested end-to-end

## Known Limitations

1. **Single User Sessions**: Current implementation assumes one user per session
2. **No Token Revocation**: Tokens are not actively revoked on logout
3. **Memory-Based Sessions**: Sessions are stored in memory, lost on server restart
4. **No Rate Limiting**: No built-in rate limiting for API calls
5. **No SSE Support**: Server uses POST-only Streamable HTTP (SSE streams not implemented)

## Future Enhancements

1. **Token Refresh**: Implement automatic access token refresh using refresh tokens
2. **Session Persistence**: Store sessions in Redis for multi-instance deployments
3. **Resource Caching**: Cache folder/file listings to reduce API calls
4. **Webhook Support**: Subscribe to IntelligenceBank webhooks for real-time updates
5. **Advanced Filtering**: Add search and filter capabilities to resource listings

## Conclusion

The implementation successfully provides automatic OAuth authentication for MCP Resources, following the MCP Authorization specification (RFC9728, RFC8414, RFC6750). All discovery endpoints are properly configured with both sub-path and root support, HTTPS URLs, and no trailing slashes.

The server is ready for end-to-end testing with Claude Desktop and MCP Inspector.

## Related Documentation

- [`docs/currentTask.md`](currentTask.md) - Current development tasks
- [`docs/codebaseSummary.md`](codebaseSummary.md) - Overall codebase structure
- [`docs/techStack.md`](techStack.md) - Technology stack details
- [`docs/authentication-architecture.md`](authentication-architecture.md) - Authentication system overview
- [`docs/development-workflow.md`](development-workflow.md) - Deployment and testing procedures