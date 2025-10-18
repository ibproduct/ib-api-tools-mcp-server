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
├── scripts/                      # Legacy installation scripts (deprecated)
│   ├── dev-install.sh           # Legacy dev installation
│   └── prod-install.sh          # Legacy prod installation
├── src/                         # Source code
│   ├── index.ts                 # Main HTTP server and MCP implementation
│   ├── auth.ts                  # Legacy auth (to be removed)
│   ├── auth-state.ts            # Legacy state management (to be removed)
│   ├── types.ts                 # TypeScript type definitions
│   └── tools/
│       └── status.ts            # Tool implementations
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

### Authentication System
- **Method**: OAuth 2.0 Authorization Code Flow with PKCE
- **Bridge Service**: AWS Lambda at `https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev`
- **Token Type**: JWT access tokens (1-hour expiry)
- **Security**: PKCE verification, state parameter, DNS rebinding protection

### Server Implementation
- **Framework**: Express.js 4.21.2
- **Runtime**: Node.js >= 18.0.0
- **Language**: TypeScript 5.3.3
- **Process Manager**: PM2 (production)
- **Reverse Proxy**: nginx with SSL/TLS

## Key Components

### HTTP Server (src/index.ts)
Main application entry point that implements:
- Express.js server setup
- StreamableHTTPServerTransport configuration
- CORS middleware
- DNS rebinding protection
- OAuth authentication tools
- Health check endpoints

**Key Functions:**
- `generateCodeVerifier()`: Creates PKCE code_verifier (32-byte random)
- `generateCodeChallenge()`: Computes SHA-256 code_challenge from verifier
- `generateState()`: Generates CSRF protection state parameter

### OAuth Tools

#### 1. auth.login
Initiates OAuth 2.0 flow with PKCE parameters.

**Input:**
- `platformUrl` (optional): IntelligenceBank instance URL

**Output:**
- `authorizationUrl`: URL for user authentication
- `state`: CSRF protection parameter
- `codeVerifier`: PKCE parameter for token exchange

**Flow:**
1. Generate PKCE code_verifier (random 32-byte base64url)
2. Compute code_challenge (SHA-256 hash of verifier)
3. Generate state parameter (random 16-byte base64url)
4. Build authorization URL with all parameters
5. Return URL and parameters to client

#### 2. auth.exchange
Exchanges authorization code for access tokens.

**Input:**
- `code`: Authorization code from OAuth callback
- `codeVerifier`: PKCE parameter from login step
- `state` (optional): State parameter for validation

**Output:**
- `accessToken`: JWT access token
- `tokenType`: "Bearer"
- `expiresIn`: Seconds until expiry (3600)
- `refreshToken`: Token for session renewal

**Flow:**
1. Validate inputs
2. POST to OAuth bridge `/token` endpoint
3. Include code, codeVerifier, and PKCE verification
4. Return tokens to client

#### 3. auth.status
Validates token and retrieves user information.

**Input:**
- `accessToken`: JWT access token

**Output:**
- `authenticated`: Boolean validity status
- `userInfo`: User details (if valid)

**Flow:**
1. GET OAuth bridge `/userinfo` endpoint
2. Include Authorization header with Bearer token
3. Return user information or error

### Legacy Components (To Be Removed)

**src/auth.ts**
- Old direct IB API browser-based authentication
- No longer used with OAuth bridge implementation
- Kept temporarily for reference

**src/auth-state.ts**
- Old polling-based state management
- Not needed with stateless HTTP transport
- To be removed in cleanup

**scripts/dev-install.sh & prod-install.sh**
- Legacy local installation scripts
- Replaced by EC2 deployment workflow
- May be removed or repurposed

## Data Flow

### OAuth Authentication Flow

```
1. Client → MCP Server: auth.login request
2. MCP Server → Client: authorizationUrl, state, codeVerifier
3. User → OAuth Bridge: Visit authorization URL
4. User → OAuth Bridge: Select platform, log in
5. OAuth Bridge → User: Redirect to callback with code
6. Client → MCP Server: auth.exchange with code, codeVerifier
7. MCP Server → OAuth Bridge: POST /token with PKCE verification
8. OAuth Bridge → MCP Server: Return access/refresh tokens
9. MCP Server → Client: Return tokens
10. Client → MCP Server: auth.status with accessToken
11. MCP Server → OAuth Bridge: GET /userinfo
12. OAuth Bridge → MCP Server: Return user information
13. MCP Server → Client: Return authenticated status
```

### API Request Flow (Future)

```
1. Client → MCP Server: API tool request with accessToken
2. MCP Server → OAuth Bridge: POST /proxy/{platform}/{path}
3. OAuth Bridge → IB API: Proxied request with credentials
4. IB API → OAuth Bridge: API response
5. OAuth Bridge → MCP Server: Proxied response
6. MCP Server → Client: Tool result
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

### December 2024 - January 2025
- Updated MCP SDK from v1.11.0 to v1.20.1
- Removed Cloudflare Workers artifacts
- Implemented Streamable HTTP transport
- Integrated OAuth 2.0 with PKCE via bridge
- Added Express.js HTTP server
- Configured CORS and DNS rebinding protection
- Created comprehensive deployment documentation
- Updated all documentation to reflect new architecture

## Development Workflow

### Local Development
1. Clone repository
2. Install dependencies: `npm install`
3. Create `.env` from `.env.example`
4. Build: `npm run build`
5. Run: `npm run dev`
6. Test with MCP Inspector or Claude desktop

### Production Deployment
1. SSH to EC2 instance
2. Clone repository to `/opt/ib-api-tools-mcp-server`
3. Install dependencies and build
4. Configure production `.env`
5. Start with PM2: `pm2 start dist/index.js`
6. Configure nginx reverse proxy
7. Set up SSL with Let's Encrypt
8. Test with production URL

## Testing Strategy

### Local Testing
- MCP Inspector: `npx @modelcontextprotocol/inspector`
- Claude Desktop: Local connection to `http://localhost:3000/mcp`
- OAuth Flow: Manual end-to-end testing
- Build Verification: `npm run build`

### Production Testing
- Health Check: `curl https://mcp.intelligencebank.com/mcp`
- Claude Desktop: Remote connection to production URL
- OAuth Flow: Complete authentication cycle
- SSL Verification: Certificate validity

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