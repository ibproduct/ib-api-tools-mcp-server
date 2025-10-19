# IntelligenceBank API Tools MCP Server

A remote MCP server that provides tools for interacting with the IntelligenceBank API using OAuth 2.0 authentication via the IntelligenceBank OAuth bridge.

## Overview

This server enables AI assistants (like Claude) to interact with IntelligenceBank APIs through a secure, authenticated connection. It uses:

- **Transport**: Streamable HTTP for remote access
- **Authentication**: OAuth 2.0 Authorization Code Flow with PKCE
- **OAuth Bridge**: Managed authentication service at AWS Lambda
- **Deployment**: Can run locally or on EC2 for production use

## Quick Start

### Local Development

1. **Clone and Install**
   ```bash
   git clone https://github.com/ibproduct/ib-api-tools-mcp-server.git
   cd ib-api-tools-mcp-server
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build and Run**
   ```bash
   npm run build
   npm run dev
   ```

   Server runs at `http://localhost:3000/mcp`

4. **Test with MCP Inspector**
   ```bash
   npx @modelcontextprotocol/inspector
   ```
   Connect to: `http://localhost:3000/mcp`

### Claude Desktop Configuration

Add to your Claude desktop config:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ib-api-tools": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

For production deployment, use: `https://mcp.connectingib.com/mcp`

## Available Tools

### auth.login

Initiates the OAuth 2.0 authentication flow.

**Input:**
- `platformUrl` (optional): Your IntelligenceBank instance URL (e.g., `https://demo.intelligencebank.com`)

**Output:**
- `authorizationUrl`: URL to visit for authentication
- `state`: CSRF protection parameter
- `codeVerifier`: PKCE parameter (needed for token exchange)

**Example:**
```typescript
use_mcp_tool ib-api-tools auth.login { "platformUrl": "https://demo.intelligencebank.com" }
```

### auth.exchange

Exchanges the authorization code for access tokens.

**Input:**
- `code`: Authorization code from the callback URL
- `codeVerifier`: PKCE parameter from login step
- `state` (optional): State parameter for validation

**Output:**
- `accessToken`: JWT access token (1-hour expiry)
- `tokenType`: Token type (Bearer)
- `expiresIn`: Seconds until token expiry
- `refreshToken`: Token for session renewal

**Example:**
```typescript
use_mcp_tool ib-api-tools auth.exchange {
  "code": "authorization-code-from-callback",
  "codeVerifier": "code-verifier-from-login"
}
```

### auth.status

Validates the access token and retrieves user information.

**Input:**
- `accessToken`: The JWT access token

**Output:**
- `authenticated`: Boolean indicating if token is valid
- `userInfo`: User details (if authenticated)

**Example:**
```typescript
use_mcp_tool ib-api-tools auth.status {
  "accessToken": "your-access-token"
}
```

## OAuth Flow

1. **Initiate Login**: Call `auth.login` to get authorization URL
2. **User Authentication**: Visit the URL, select platform, and log in
3. **Callback**: User is redirected with authorization code
4. **Exchange Code**: Call `auth.exchange` with code and verifier
5. **Use Token**: Call `auth.status` or API tools with access token

## Environment Variables

Required environment variables (see `.env.example`):

- `OAUTH_BRIDGE_URL`: OAuth bridge service URL
- `OAUTH_CLIENT_ID`: Client identifier for this MCP server
- `OAUTH_REDIRECT_URI`: OAuth callback URL
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `ALLOWED_ORIGINS`: CORS allowed origins
- `ENABLE_DNS_REBINDING_PROTECTION`: Enable origin validation
- `ALLOWED_HOSTS`: Allowed hostnames for DNS rebinding protection

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Development Workflow](docs/development-workflow.md)**: Local development, testing, and deployment
- **[Tech Stack](docs/techStack.md)**: Technology choices and architecture
- **[Codebase Summary](docs/codebaseSummary.md)**: Project structure and components
- **[Current Task](docs/currentTask.md)**: Current development status
- **[Project Roadmap](docs/projectRoadmap.md)**: Goals and progress

## Production Deployment

**Live Production Server:**
- **Endpoint**: https://mcp.connectingib.com/mcp
- **Instance**: EC2 i-0d648adfb366a8889 (us-west-1)
- **SSL**: Let's Encrypt certificate (auto-renewal enabled)
- **Status**: Running and verified ✓

For deployment details, see the [Development Workflow](docs/development-workflow.md#production-deployment-ec2) documentation.

Key steps:
1. Set up EC2 instance with Node.js and nginx
2. Clone repository and build
3. Configure production environment variables
4. Start with PM2 process manager
5. Configure nginx reverse proxy with SSL/TLS
6. Set up DNS and SSL certificate

## Security

- OAuth 2.0 with PKCE for secure authentication
- HTTPS required for production
- CORS configuration for allowed origins
- DNS rebinding protection
- Token expiry and refresh handling

## Support

- **Issues**: https://github.com/ibproduct/ib-api-tools-mcp-server/issues
- **Documentation**: See `docs/` directory
- **OAuth Bridge**: https://github.com/ibproduct/ib-oauth-bridge-experimental

## License

MIT