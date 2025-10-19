# Current Task: Test and Deploy Remote MCP Server with OAuth Authentication

## Objective
Complete testing of the HTTP-based MCP server with OAuth 2.0 authentication and deploy to production EC2 infrastructure.

## Current State
- **MCP SDK**: Successfully updated to v1.20.1 ✓
- **HTTP Transport**: Implemented with Streamable HTTP ✓
- **OAuth Integration**: Complete with PKCE flow ✓
- **Build Status**: Successfully compiled ✓
- **Documentation**: Fully updated ✓
- **Production Deployment**: Live on EC2 (http://52.9.99.47:3000/mcp) ✓
- **Status**: Ready for testing in Claude Desktop

## Completed Work

### Phase 1: Clean Up & Dependencies ✓
- [x] Updated MCP SDK to v1.20.1
- [x] Reviewed current implementation
- [x] Removed Cloudflare Workers artifacts (wrangler.jsonc, worker-configuration.d.ts)
- [x] Added Express.js, CORS, dotenv dependencies
- [x] Updated package.json with new dependencies and version

### Phase 2: HTTP Transport Implementation ✓
- [x] Replaced stdio transport with Streamable HTTP transport
- [x] Created Express server with POST/GET endpoints at `/mcp`
- [x] Implemented stateless mode (new transport per request)
- [x] Added CORS configuration for browser access
- [x] Added DNS rebinding protection

### Phase 3: OAuth Bridge Integration ✓
- [x] Implemented OAuth 2.0 authorization flow with PKCE
- [x] Created OAuth client configuration
- [x] Implemented three authentication tools:
  - `auth.login`: Generate authorization URL with PKCE parameters
  - `auth.exchange`: Exchange code for access/refresh tokens
  - `auth.status`: Validate token and retrieve user info
- [x] Implemented JWT token handling (client-managed)
- [x] Created helper functions for PKCE (code_verifier, code_challenge, state)

### Phase 4: Documentation ✓
- [x] Created comprehensive development-workflow.md
- [x] Updated README.md with HTTP transport usage
- [x] Updated techStack.md to reflect MCP SDK 1.20.1 and new architecture
- [x] Updated codebaseSummary.md with current implementation details
- [x] Merged workflow.md and deployment.md into development-workflow.md
- [x] Removed obsolete documentation files

### Phase 5: Production Deployment ✓
- [x] Created EC2 instance (i-0d648adfb366a8889)
- [x] Allocated Elastic IP (52.9.99.47)
- [x] Installed Node.js 24.10.0 and PM2
- [x] Deployed code to `/opt/ib-api-tools-mcp-server`
- [x] Created production `.env` file with correct configuration
- [x] Started with PM2 (process name: ib-mcp-server)
- [x] Configured security group for ports 22, 80, 443, 3000, 4001
- [x] Verified MCP protocol endpoint responding correctly
- [x] Tested all three OAuth tools via curl

## Production Deployment Details

### EC2 Instance
- **Instance ID**: i-0d648adfb366a8889
- **Public IP**: 52.9.99.47 (Elastic IP: eipalloc-0bba57986860e351c)
- **Region**: us-west-1
- **AMI**: ami-04f34746e5e1ec0fe (Ubuntu 22.04 LTS)
- **Instance Type**: t2.micro (or similar)
- **Security Group**: sg-016b96bf0ebfadfd2

### Deployment Configuration
- **Node.js**: v24.10.0
- **Process Manager**: PM2 (ib-mcp-server)
- **Installation Path**: `/opt/ib-api-tools-mcp-server`
- **MCP Endpoint**: `http://52.9.99.47:3000/mcp`
- **Environment**: Production (.env configured)

### Verified Functionality
```bash
# MCP protocol initialize test
curl -X POST http://52.9.99.47:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

# Response: Server info with protocol version and capabilities ✓

# Tools list test
curl -X POST http://52.9.99.47:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Response: Three tools (auth.login, auth.exchange, auth.status) ✓
```

## Remaining Tasks

### Testing Phase
- [ ] Test with MCP Inspector on production endpoint
- [ ] Complete OAuth flow end-to-end on production:
  - [ ] Call `auth.login` tool
  - [ ] Visit authorization URL in browser
  - [ ] Complete OAuth flow on IB platform
  - [ ] Call `auth.exchange` with code and verifier
  - [ ] Call `auth.status` with access token
- [ ] Test in Claude desktop with production server
- [ ] Verify error handling and edge cases

### Optional Future Enhancements
- [ ] Configure nginx reverse proxy for SSL termination
- [ ] Obtain SSL certificate with Let's Encrypt
- [ ] Configure DNS for production domain (e.g., mcp-api.intelligencebank.com)
- [ ] Configure firewall (UFW) for additional security
- [ ] Set up CloudWatch monitoring

## Implementation Details

### Transport: Streamable HTTP
- **POST** `/mcp` - Client-to-server messages (JSON-RPC requests/responses/notifications)
- **GET** `/mcp` - Server-to-client notifications via SSE (optional)
- **Stateless mode**: New transport instance per request to prevent request ID collisions
- **CORS enabled**: Configurable origins via ALLOWED_ORIGINS environment variable
- **DNS rebinding protection**: Origin and host validation for security

### Authentication: OAuth 2.0 via Bridge
- **Bridge URL**: `https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev/`
- **Flow**: Authorization code with PKCE (Proof Key for Code Exchange)
- **Endpoints**:
  - `/authorize` - Start OAuth flow with PKCE parameters
  - `/token` - Exchange code for tokens with PKCE verification
  - `/proxy/{platform-domain}/{api-path}` - Proxied IB API calls (future)
  - `/userinfo` - Validate token and get user information
- **Token Management**:
  - JWT access tokens (1 hour expiry)
  - Refresh tokens for session renewal (future implementation)
  - Client-managed token storage
- **PKCE Implementation**:
  - code_verifier: 32-byte random base64url string
  - code_challenge: SHA-256 hash of code_verifier
  - state: 16-byte random base64url for CSRF protection

### Deployment: EC2 Server
- **Infrastructure**: EC2 instance i-0d648adfb366a8889 (us-west-1)
- **Public IP**: 52.9.99.47 (Elastic IP)
- **Endpoint**: http://52.9.99.47:3000/mcp
- **Process Manager**: PM2 (ib-mcp-server process)
- **Environment**: Production .env with OAuth bridge configuration
- **Node.js**: v24.10.0
- **Status**: Running and verified ✓
- **Future**: nginx reverse proxy, SSL/TLS via Let's Encrypt, DNS configuration

## Architecture Overview

```
Claude Desktop/Client
    ↓ HTTP POST (JSON-RPC)
MCP Server (Express on EC2)
    ↓ OAuth 2.0 Flow
OAuth Bridge (AWS Lambda)
    ↓ Authenticated Proxy
IntelligenceBank API
```

## Implemented Tools

### 1. auth.login
Initiates OAuth 2.0 authorization flow with PKCE.

**Implementation:**
- Generates 32-byte random code_verifier (base64url)
- Computes SHA-256 code_challenge from verifier
- Generates 16-byte random state parameter
- Constructs authorization URL with all parameters
- Returns URL and parameters to client

**Input Schema:**
```typescript
{
  platformUrl?: string  // Optional IB instance URL
}
```

**Output:**
```typescript
{
  authorizationUrl: string,  // URL to visit for authentication
  state: string,             // CSRF protection parameter
  codeVerifier: string       // PKCE parameter for exchange step
}
```

### 2. auth.exchange
Exchanges authorization code for access tokens.

**Implementation:**
- Validates input parameters
- POSTs to OAuth bridge `/token` endpoint
- Includes code, codeVerifier, and redirect URI
- Returns access and refresh tokens

**Input Schema:**
```typescript
{
  code: string,          // Authorization code from callback
  codeVerifier: string,  // PKCE parameter from login step
  state?: string         // Optional state for validation
}
```

**Output:**
```typescript
{
  accessToken: string,   // JWT access token
  tokenType: string,     // "Bearer"
  expiresIn: number,     // Seconds until expiry (3600)
  refreshToken: string   // Token for session renewal
}
```

### 3. auth.status
Validates token and retrieves user information.

**Implementation:**
- Calls OAuth bridge `/userinfo` endpoint
- Includes Authorization header with Bearer token
- Returns user information if valid

**Input Schema:**
```typescript
{
  accessToken: string    // JWT access token to validate
}
```

**Output:**
```typescript
{
  authenticated: boolean,
  userInfo?: {
    // User details from OAuth bridge
  }
}
```

## Environment Variables

```bash
# OAuth Bridge Configuration
OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
OAUTH_CLIENT_ID=ib-api-tools-mcp-server-{generated-uuid}
OAUTH_REDIRECT_URI=http://localhost:3000/callback  # Local dev
# OAUTH_REDIRECT_URI=https://mcp.example.com/callback  # Production

# MCP Server Configuration
PORT=3000
NODE_ENV=development  # or production
ALLOWED_ORIGINS=*  # Configure for production

# DNS Rebinding Protection
ENABLE_DNS_REBINDING_PROTECTION=true
ALLOWED_HOSTS=127.0.0.1,localhost
```

## Testing Strategy

### Local Development
1. Start OAuth bridge locally: `cd ../ib-oauth-bridge-experimental && npm start`
2. Start MCP server: `npm run dev`
3. Test with MCP Inspector: `npx @modelcontextprotocol/inspector`
4. Connect to: `http://localhost:3000/mcp`

### Integration Testing
1. Test OAuth flow end-to-end
2. Test token refresh logic
3. Test session expiry handling
4. Test proxy endpoint calls
5. Test error handling

### Production Testing
1. Deploy to EC2
2. Configure reverse proxy
3. Test SSL/TLS connection
4. Test with Claude desktop app
5. Monitor logs and performance

## Next Immediate Steps

1. **Claude Desktop Testing** (Priority 1)
   - Add MCP server to Claude desktop configuration
   - Use configuration: `mcp_settings_production.json`
   - Test OAuth flow end-to-end
   - Verify all three auth tools working

2. **Optional SSL/DNS Configuration** (Priority 2)
   - Set up nginx reverse proxy
   - Obtain Let's Encrypt SSL certificate
   - Configure DNS for friendly domain name
   - Update OAuth redirect URI configuration

3. **Future Enhancements** (Priority 3)
   - Implement additional IB API tools using `/proxy/*` endpoints
   - Add automatic token refresh logic
   - Implement comprehensive error handling
   - Add CloudWatch monitoring and alerts

## Success Criteria

- [x] MCP SDK updated to latest version (v1.20.1)
- [x] HTTP transport implemented and building successfully
- [x] OAuth 2.0 PKCE flow implemented
- [x] Documentation fully updated
- [x] Deployed to production EC2
- [x] MCP protocol verified on production endpoint
- [x] All three auth tools available and responding
- [ ] OAuth flow tested end-to-end on production
- [ ] Tested in Claude desktop with production URL

## Related Documentation
- **Development Workflow**: `docs/development-workflow.md`
- **Tech Stack**: `docs/techStack.md`
- **Codebase Summary**: `docs/codebaseSummary.md`
- **Project Roadmap**: `docs/projectRoadmap.md`
- **OAuth Bridge**: `../ib-oauth-bridge-experimental/README.md`
- **MCP SDK**: `node_modules/@modelcontextprotocol/sdk/README.md`