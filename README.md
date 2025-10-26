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

### Authentication Tools

#### auth_login

Initiates the OAuth 2.0 authentication flow with automatic token exchange.

**Input:**
- `platformUrl` (optional): Your IntelligenceBank instance URL (e.g., `https://demo.intelligencebank.com`)

**Output:**
- `authorizationUrl`: URL to visit for authentication
- `sessionId`: Session identifier for tracking authentication progress
- `instructions`: User-friendly instructions for next steps

**Example:**
```typescript
use_mcp_tool ib-api-tools auth_login { "platformUrl": "https://demo.intelligencebank.com" }
```

### auth_status

Checks authentication status and retrieves tokens or user information.

**Input:**
- `sessionId` (optional): Session ID from login step (for polling authentication)
- `accessToken` (optional): Access token to validate and get user info

**Note:** Provide either `sessionId` OR `accessToken`, not both.

**Output (with sessionId):**
- `status`: Authentication status (pending/completed/error)
- `authenticated`: Boolean indicating completion
- `tokens`: Access and refresh tokens (if completed)
- `userInfo`: User details (if completed)

**Output (with accessToken):**
- `authenticated`: Boolean indicating if token is valid
- `userInfo`: User details (if valid)
- `expiresIn`: Seconds until token expiry

**Example:**
```typescript
// Check authentication progress
use_mcp_tool ib-api-tools auth_status { "sessionId": "session-id-from-login" }

// Validate existing token
use_mcp_tool ib-api-tools auth_status { "accessToken": "your-access-token" }
```

#### api_call

Makes authenticated API calls to IntelligenceBank using direct API access.

**Input:**
- `sessionId`: Session ID from successful authentication
- `method`: HTTP method (GET, POST, PUT, DELETE, PATCH)
- `path`: API endpoint path (e.g., `/api/3.0.0/BnK4JV/resource`)
- `body` (optional): Request body for POST/PUT/PATCH requests
- `headers` (optional): Additional headers

**Output:**
- `success`: Boolean indicating if request succeeded
- `data`: Response data from the API
- `status`: HTTP status code

**Features:**
- Uses IntelligenceBank session ID (`sid`) for authentication
- Clear error messages for authentication failures
- Session expiry detection with re-authentication prompt
- Retry logic for transient failures

**Example:**
```typescript
use_mcp_tool ib-api-tools api_call {
  "sessionId": "your-session-id",
  "method": "GET",
  "path": "/api/3.0.0/BnK4JV/resource"
}
```

### Compliance Review Tools

#### get_compliance_filters

Retrieves available category filters for compliance reviews.

**Input:**
- `sessionId`: Session ID from successful authentication

**Output:**
- `filters`: Array of available category filters with:
  - `name`: Filter name (e.g., "Channel", "Market", "Region")
  - `values`: Array of selectable filter values
  - `uuid`: Unique identifier for each value

**Example:**
```typescript
use_mcp_tool ib-api-tools get_compliance_filters {
  "sessionId": "your-session-id"
}
```

#### run_file_compliance_review

Runs a complete file compliance review workflow with automatic polling.

**Input:**
- `sessionId`: Session ID from successful authentication
- `file`: File to review (supports multiple formats):
  - String path: `"/path/to/file.pdf"`
  - Object with path: `{ "path": "/path/to/file.pdf" }`
  - Object with base64: `{ "filename": "doc.pdf", "content": "base64..." }`
- `categorization` (optional): Array of category filters to apply:
  ```json
  [
    {
      "categoryName": "Channel",
      "selectedOptions": ["Digital", "Print"]
    }
  ]
  ```
- `pollTimeout` (optional): Maximum time to wait for review completion in seconds (default: 300)
- `pollInterval` (optional): Time between status checks in seconds (default: 5)

**Output:**
- `reviewId`: Unique identifier for the review
- `status`: Review status ("completed" or "error")
- `summary`: Overview of findings:
  - `totalIssues`: Total number of compliance issues found
  - `issuesByRule`: Breakdown by rule type
  - `issuesByPage`: Breakdown by page number
- `issues`: Array of detailed compliance findings with:
  - `term`: Text that triggered the issue
  - `explanation`: Description of the compliance concern
  - `sentence`: Full sentence containing the issue
  - `ruleName`: Internal rule identifier
  - `ruleDescription`: User-friendly rule name
  - `page`: Page number where issue was found
  - `feedback` (optional): Additional guidance

**Features:**
- Uploads file to IntelligenceBank
- Creates compliance review with optional categorization
- Automatically polls for completion (typically 2-3 minutes)
- Returns formatted, user-friendly results
- Supports PDF and other document formats

**Example:**
```typescript
use_mcp_tool ib-api-tools run_file_compliance_review {
  "sessionId": "your-session-id",
  "file": "/path/to/document.pdf",
  "categorization": [
    {
      "categoryName": "Channel",
      "selectedOptions": ["Digital"]
    },
    {
      "categoryName": "Market",
      "selectedOptions": ["APAC"]
    }
  ]
}
```

#### auth_exchange (DEPRECATED)

This tool is deprecated. The `/callback` endpoint now handles token exchange automatically. Use `auth_login` and `auth_status` instead.

## OAuth Flow

### Automatic Flow (Recommended)

The OAuth flow is now fully automatic with session-based tracking:

1. **Initiate Login**: Call `auth_login` to receive:
   - Authorization URL to visit in browser
   - Session ID for tracking authentication progress

2. **User Authentication**:
   - Visit the authorization URL in your browser
   - Select your IntelligenceBank platform
   - Complete the login process

3. **Automatic Token Exchange**:
   - Upon successful authentication, you're redirected to `/callback`
   - Server automatically exchanges authorization code for tokens
   - You see a success confirmation page
   - Tokens are stored in the session

4. **Retrieve Tokens**:
   - Poll `auth_status` with your session ID
   - Receive access token, refresh token, and user information

5. **Make API Calls**:
   - Use `api_call` tool with session ID for authenticated requests
   - Tokens automatically refresh when needed
   - Re-authentication only required when refresh token expires

### Session Management

- Sessions expire after 5 minutes if authentication is not completed
- Automatic cleanup of expired sessions runs every minute
- Tokens refresh automatically on 401 errors during API calls
- Re-authentication required only when session or refresh token expires

## Available Prompts

### compliance_review_help

Post-login guidance prompt that helps users run file compliance reviews. This prompt appears after successful authentication and provides step-by-step instructions for:

1. Optionally checking available category filters
2. Running a file compliance review
3. Understanding the review results

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

- **[Authentication Audit](docs/authentication-audit.md)**: Comprehensive authentication architecture analysis
- **[Development Workflow](docs/development-workflow.md)**: Local development, testing, and deployment
- **[Tech Stack](docs/techStack.md)**: Technology choices and architecture
- **[Codebase Summary](docs/codebaseSummary.md)**: Project structure and components
- **[Current Task](docs/currentTask.md)**: Current development status
- **[Project Roadmap](docs/projectRoadmap.md)**: Goals and progress

### Key Concepts

**Dual-Authentication System:**
- **OAuth 2.0 Tokens**: Used for MCP protocol compliance (access_token, refresh_token)
- **IntelligenceBank Credentials**: Used for actual API calls (sid, clientId, apiV3url)

The OAuth bridge returns both types of credentials in the token response. OAuth tokens satisfy the MCP SDK requirement, while IntelligenceBank session credentials (`sid`) are used for direct API calls.

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