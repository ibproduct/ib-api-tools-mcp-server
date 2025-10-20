# Codebase Summary

## Project Structure

```
/
├── docs/                          # Project documentation
│   ├── codebaseSummary.md         # This file
│   ├── currentTask.md             # Current development status
│   ├── development-workflow.md    # Complete workflow guide
│   ├── hosting_considerations.md  # Infrastructure notes
│   ├── projectRoadmap.md         # Goals and progress
│   ├── techStack.md              # Technology stack details
│   └── transport.md              # Transport specification
├── scripts/                      # Deployment and utility scripts
│   ├── deploy.sh                # Production deployment script
│   ├── dev-install.sh           # Development setup
│   ├── prod-install.sh          # Production setup
│   └── ec2-user-data.sh         # EC2 instance initialization
├── src/                         # Source code (modular architecture)
│   ├── index.ts                 # Main server entry point
│   ├── types.ts                 # Legacy types (to be removed)
│   ├── auth/                    # OAuth protocol implementation
│   │   ├── oauth-callback.ts    # OAuth callback handler
│   │   ├── oauth-utils.ts       # PKCE utilities
│   │   ├── token-manager.ts     # Token refresh logic
│   │   └── html-pages.ts        # Success/error HTML pages
│   ├── core/                    # Core infrastructure
│   │   └── tool-registry.ts     # Tool registration helper
│   ├── server/                  # HTTP server setup
│   │   └── express-setup.ts     # Express app configuration
│   ├── session/                 # Session management
│   │   └── SessionManager.ts    # Auth session lifecycle
│   ├── tools/                   # MCP tool implementations
│   │   ├── auth-login.tool.ts   # Start OAuth flow
│   │   ├── auth-status.tool.ts  # Check auth status
│   │   ├── api-call.tool.ts     # Make authenticated API calls
│   │   └── status.ts            # Legacy status tool
│   └── types/                   # Type definitions
│       └── session.types.ts     # AuthSession interface
├── .env.example                 # Environment variable template
├── biome.json                   # Code formatting/linting config
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
└── README.md                    # Project overview and quick start
```
## Architecture Overview

### Transport Layer
- **Protocol**: Model Context Protocol (MCP) v1.20.1
- **Transport**: Streamable HTTP (POST/GET endpoints)
- **Endpoint**: `/mcp` for JSON-RPC communication
- **Mode**: Stateless (new transport per request)
- **CORS**: Enabled for browser-based clients

### Authentication System (Dual Architecture)
- **Method**: OAuth 2.0 Authorization Code Flow with PKCE
- **Bridge Service**: AWS Lambda at `https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev`
- **OAuth Tokens**: JWT access tokens (1-hour expiry) - for MCP protocol compliance
- **IB Session Credentials**: `sid`, `clientId`, `apiV3url` - for actual API calls
- **Session Lifetime**: 1-120 hours (configurable via `logintimeoutperiod`)
- **Security**: PKCE verification, state parameter, DNS rebinding protection

### Server Implementation
- **Framework**: Express.js 4.21.2
- **Runtime**: Node.js >= 24.0.0
- **Language**: TypeScript 5.3.3
- **Process Manager**: PM2 (production)
- **Deployment**: EC2 (i-0d648adfb366a8889, us-west-1)
- **Domain**: mcp.connectingib.com
- **Production Endpoint**: https://mcp.connectingib.com/mcp
- **SSL/TLS**: Let's Encrypt certificate with nginx reverse proxy

## Key Components

### Main Server (src/index.ts)
Application entry point that orchestrates all components:
- Initializes SessionManager for auth session tracking
- Creates OAuthCallbackHandler for token exchange
- Registers MCP tools (auth_login, auth_status, api_call)
- Sets up Express routes (/callback, /mcp)
- Handles graceful shutdown

### Session Management (src/session/SessionManager.ts)
Manages authentication session lifecycle:
- Creates and tracks auth sessions with unique IDs
- Stores OAuth tokens and IntelligenceBank credentials
- Automatic cleanup of expired sessions (5-minute TTL)
- Session lookup by ID or OAuth state parameter

### OAuth Components (src/auth/)

#### OAuth Callback Handler (oauth-callback.ts)
Handles OAuth redirect and token exchange:
- Exchanges authorization code for tokens
- Extracts BOTH OAuth tokens AND IntelligenceBank session data
- Fetches user information
- Returns success/error HTML pages

**Critical Logic:**
- Extracts `sid`, `clientId`, `apiV3url` from OAuth bridge token response
- Stores in `session.ibSession` for API calls
- Displays success page with user confirmation

#### OAuth Utilities (oauth-utils.ts)
PKCE and OAuth parameter generation:
- `generateCodeVerifier()`: Creates PKCE code_verifier (32-byte random)
- `generateCodeChallenge()`: Computes SHA-256 code_challenge from verifier
- `generateState()`: Generates CSRF protection state parameter

#### HTML Pages (html-pages.ts)
User-facing pages for OAuth flow:
- Success page: Confirmation after successful authentication
- Error page: Error details when authentication fails

#### Token Manager (token-manager.ts)
OAuth token refresh logic:
- Refreshes OAuth access tokens using refresh token
- Note: Currently not actively used (see authentication-audit.md)
- Kept for MCP protocol compliance

### MCP Tools (src/tools/)

#### 1. auth_login.tool.ts
MCP tool to start OAuth 2.0 flow.

**Input:**
- `platformUrl` (optional): IntelligenceBank instance URL

**Output:**
- `authorizationUrl`: URL for user authentication
- `sessionId`: Session ID for tracking authentication
- `instructions`: User-friendly next steps

**Flow:**
1. Generate PKCE parameters (code_verifier, code_challenge)
2. Generate OAuth state parameter
3. Create session in SessionManager
4. Build authorization URL with all parameters
5. Return URL and session ID to client

#### 2. auth_status.tool.ts
MCP tool to check authentication status.

**Input:**
- `sessionId`: Session ID from auth_login

**Output (pending):**
- `status`: "pending"
- `authenticated`: false

**Output (completed):**
- `status`: "completed"
- `authenticated`: true
- `tokens`: OAuth access and refresh tokens
- `userInfo`: User details

**Output (error):**
- `status`: "error"
- `error`: Error code
- `errorDescription`: Error details

#### 3. api_call.tool.ts
MCP tool to make authenticated IntelligenceBank API calls.

**Input:**
- `sessionId`: Session ID from successful authentication
- `method`: HTTP method (GET, POST, PUT, DELETE, PATCH)
- `path`: API endpoint path or full URL
- `body` (optional): Request body
- `headers` (optional): Additional headers

**Output:**
- `success`: Boolean indicating success
- `status`: HTTP status code
- `data`: Response data

**Key Features:**
- Uses `sid` from `session.ibSession` for authentication
- Makes direct API calls (no proxy)
- Handles 401 by marking session as expired
- Prompts user to re-authenticate via auth_login

### Type Definitions (src/types/)

#### session.types.ts
Defines `AuthSession` interface with dual authentication:
```typescript
{
  sessionId: string;           // MCP session tracking
  state: string;               // OAuth state parameter
  codeVerifier: string;        // PKCE code verifier
  
  tokens: {                    // OAuth tokens (MCP compliance)
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  
  ibSession: {                 // IntelligenceBank credentials (API calls)
    sid: string;               // Session ID for direct API calls
    clientId: string;          // IB client ID
    apiV3url: string;          // IB API base URL
    logintimeoutperiod: number; // Session validity (1-120 hours)
    sidExpiry: number;         // Unix timestamp when sid expires
  };
}
```

## Data Flow

### OAuth Authentication Flow (Automatic)

```
1. Client → MCP Server: auth_login request
2. MCP Server → Client: authorizationUrl, sessionId
3. User → OAuth Bridge: Visit authorization URL in browser
4. User → OAuth Bridge: Select platform, log in
5. OAuth Bridge → User: Redirect to /callback with authorization code
6. MCP Server (/callback): Exchange code for tokens automatically
7. OAuth Bridge → MCP Server: Return access/refresh tokens + IB credentials
8. MCP Server: Extract sid, clientId, apiV3url from response
9. MCP Server: Store in session.ibSession
10. MCP Server → User: Display success HTML page
11. Client → MCP Server: Poll auth_status with sessionId
12. MCP Server → Client: Return tokens and user info
```

### API Request Flow (Direct)

```
1. Client → MCP Server: api_call with sessionId
2. MCP Server: Retrieve session.ibSession.sid
3. MCP Server → IB API: Direct request with sid header
4. IB API → MCP Server: API response
5. MCP Server → Client: Tool result

On 401 Error:
6. MCP Server: Mark session as expired
7. MCP Server → Client: Error with re-authentication prompt
8. User must call auth_login again
```

## External Dependencies

### OAuth Bridge Service
- **Location**: `../ib-oauth-bridge-experimental`
- **URL**: `https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev`
- **Purpose**: Managed OAuth 2.0 authentication for IntelligenceBank
- **Endpoints**:
  - `/authorize`: Start OAuth flow
  - `/token`: Exchange code for tokens
  - `/proxy/{platform}/{path}`: Proxy IB API calls
  - `/userinfo`: Validate token and get user info

### IntelligenceBank API
- **Access**: Via OAuth bridge proxy endpoints
- **Authentication**: OAuth 2.0 Bearer tokens
- **Platform-Specific**: Each customer has unique instance URL

### npm Packages
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **express**: HTTP server framework
- **cors**: CORS middleware
- **dotenv**: Environment variable management
- **TypeScript**: Type safety and compilation

## Configuration Management

### Environment Variables (.env)
- `OAUTH_BRIDGE_URL`: OAuth bridge service URL
- `OAUTH_CLIENT_ID`: Client identifier
- `OAUTH_REDIRECT_URI`: OAuth callback URL
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `ALLOWED_ORIGINS`: CORS whitelist
- `ENABLE_DNS_REBINDING_PROTECTION`: Security feature toggle
- `ALLOWED_HOSTS`: Allowed hostnames for local binding

### TypeScript Configuration (tsconfig.json)
- **Target**: ES2022
- **Module**: NodeNext
- **Module Resolution**: NodeNext
- **Output Directory**: dist/
- **Source Directory**: src/
- **Strict Mode**: Enabled

### Code Quality (biome.json)
- **Indentation**: 4 spaces
- **Line Width**: 100 characters
- **Quote Style**: Double quotes
- **Formatter**: Enabled
- **Linter**: Enabled with recommended rules

## Recent Changes

### January 2025 - Production Deployment
- **MCP SDK**: Updated from v1.11.0 to v1.20.1
- **Architecture**: Removed Cloudflare Workers, implemented HTTP transport
- **Authentication**: Integrated OAuth 2.0 with PKCE via bridge
- **Server**: Express.js HTTP server with CORS and DNS rebinding protection
- **Documentation**: Comprehensive overhaul of all docs
- **Deployment**: Live on EC2 (52.9.99.47:3000/mcp)
- **Status**: Verified and operational ✓

### Production Instance Details
- **Instance ID**: i-0d648adfb366a8889
- **Region**: us-west-1
- **IP**: 52.9.99.47 (Elastic IP: eipalloc-0bba57986860e351c)
- **Domain**: mcp.connectingib.com
- **Endpoint**: https://mcp.connectingib.com/mcp
- **Node.js**: v24.10.0
- **nginx**: 1.18.0 (reverse proxy with SSL/TLS)
- **PM2**: Running ib-mcp-server process
- **SSL**: Let's Encrypt (expires 2026-01-17, auto-renewal enabled)
- **Verified**: MCP protocol initialize ✓, Tools list ✓, HTTPS ✓

## Development Workflow

### Local Development
1. Clone repository
2. Install dependencies: `npm install`
3. Create `.env` from `.env.example`
4. Build: `npm run build`
5. Run: `npm run dev`
6. Test with MCP Inspector or Claude desktop

### Production Deployment (Current)
**Live Instance**: EC2 i-0d648adfb366a8889 in us-west-1

1. **Access Production**:
   ```bash
   ssh -i ~/Workspace/Keys/ib-mcp-api-tools-keypair-2025.pem ubuntu@52.9.99.47
   ```

2. **Update Production**:
   ```bash
   cd /opt/ib-api-tools-mcp-server
   sudo git pull origin main
   sudo npm install
   sudo npm run build
   pm2 restart ib-mcp-server
   ```

3. **Verify Deployment**:
   ```bash
   curl -X POST https://mcp.connectingib.com/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
   ```

## Testing Strategy

### Local Testing
- MCP Inspector: `npx @modelcontextprotocol/inspector`
- Claude Desktop: Local connection to `http://localhost:3000/mcp`
- OAuth Flow: Manual end-to-end testing
- Build Verification: `npm run build`

### Production Testing
- **Health Check**: `curl -I https://mcp.connectingib.com/mcp`
- **MCP Protocol**: POST requests with proper headers ✓
- **Tools Available**: auth_login, auth_exchange, auth_status ✓
- **SSL/TLS**: Let's Encrypt certificate verified ✓
- **Claude Desktop**: Use `mcp_settings_production.json` configuration

## Future Enhancements

### Planned Features
- Additional IB API tools (resources, search, workflows)
- Automatic token refresh logic
- Enhanced error handling and retry mechanisms
- Comprehensive logging and monitoring
- Rate limiting and quota management

### Infrastructure Improvements
- Docker containerization
- Kubernetes orchestration
- CI/CD pipeline (GitHub Actions)
- Automated testing suite
- Metrics and APM integration

## User Feedback Integration

Currently in initial deployment phase. User feedback will drive:
- Tool prioritization and development
- UX improvements for authentication flow
- Performance optimizations
- Feature requests and enhancements

## Support and Documentation

- **README.md**: Quick start and overview
- **docs/development-workflow.md**: Complete development guide
- **docs/techStack.md**: Detailed technology documentation
- **docs/currentTask.md**: Current development status
- **docs/projectRoadmap.md**: Goals and progress tracking
- **GitHub Issues**: Bug reports and feature requests