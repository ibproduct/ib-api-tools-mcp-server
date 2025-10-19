# Technology Stack

## Core Technologies

### MCP Framework
- **@modelcontextprotocol/sdk v1.20.1**
  - StreamableHTTPServerTransport for remote access via HTTP
  - Tool registration and handling
  - JSON-RPC message processing
  - Stateless mode support

### Runtime
- **Node.js >= 24.0.0** (Production: v24.10.0)
- **TypeScript 5.3.3**
- **ESM modules**

### HTTP Server
- **Express.js 4.21.2**: HTTP server framework
  - POST/GET endpoints for MCP protocol
  - Middleware support for CORS, logging, error handling
  - Production-ready server implementation

### Dependencies
- **cors**: CORS middleware for browser clients
- **dotenv**: Environment variable management
- **crypto**: Native Node.js crypto for PKCE implementation
- **TypeScript definitions**: @types/express, @types/cors, @types/node

### Development Dependencies
- **tsx**: TypeScript execution and watch mode
- **biome**: Code formatting and linting
- **@types/***: TypeScript type definitions

## Authentication Architecture

### OAuth 2.0 Implementation
- **Flow**: Authorization Code Flow with PKCE
- **Bridge Service**: AWS Lambda at `https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev`
- **Token Type**: JWT access tokens with 1-hour expiry
- **Security**: PKCE (code_verifier/code_challenge), state parameter for CSRF protection

### OAuth Endpoints
- **/authorize**: Initiate OAuth flow with PKCE parameters
- **/token**: Exchange authorization code for access/refresh tokens
- **/proxy/{platform}/{path}**: Proxied IntelligenceBank API calls
- **/userinfo**: Validate token and retrieve user information

### Session Management
- **Timeout**: 1-120 hour configurable session lifetime
- **Refresh Window**: 5-minute window before expiry
- **Re-authentication**: Automatic prompt on session expiry

## Transport Layer

### Streamable HTTP
- **Endpoint**: POST/GET `/mcp` for JSON-RPC communication
- **POST**: Client-to-server messages (requests/responses/notifications)
- **GET**: Server-to-client notifications via Server-Sent Events (SSE)
- **Stateless Mode**: New transport instance per request (prevents ID collisions)
- **Session ID**: Optional session tracking via Mcp-Session-Id header

### CORS Configuration
- **Enabled**: For browser-based MCP clients
- **Exposed Headers**: Mcp-Session-Id
- **Configurable Origins**: Environment-based origin whitelist

### DNS Rebinding Protection
- **Origin Validation**: Configurable origin header validation
- **Host Validation**: Allowed hosts list for localhost binding
- **Production Mode**: Strict validation enabled

## Development Tools

### Build System
- **TypeScript Compiler**: Strict mode, ESNext target
- **npm Scripts**: Automated build, dev, and deployment tasks
- **Module System**: NodeNext for modern Node.js compatibility

### Code Quality
- **Biome**: Unified formatter and linter
  - 4-space indentation
  - 100 character line width
  - Consistent code style across project

### Environment Management
- **dotenv**: Load environment variables from .env file
- **Environment Types**: development, production
- **Configuration Validation**: Runtime environment variable checks

### Version Control
- **Git**: Source control
- **GitHub**: Repository hosting
- **Conventional Commits**: Structured commit messages

## Project Organization

### Source Code Structure
```
src/
├── index.ts          # Main HTTP server and MCP implementation
├── auth.ts           # Legacy authentication (to be removed)
├── auth-state.ts     # Legacy state management (to be removed)
├── types.ts          # TypeScript type definitions
└── tools/
    └── status.ts     # Tool implementations
```

### Documentation
```
docs/
├── codebaseSummary.md          # Project structure overview
├── currentTask.md              # Current development status
├── development-workflow.md     # Complete workflow guide
├── hosting_considerations.md   # Infrastructure considerations
├── projectRoadmap.md          # Goals and progress tracking
├── techStack.md               # This file
└── transport.md               # Transport specification
```

### Configuration Files
- **tsconfig.json**: TypeScript compiler settings
- **package.json**: Dependencies and npm scripts
- **biome.json**: Code formatting and linting rules
- **.env**: Environment variables (not committed)
- **.env.example**: Environment variable template
- **.gitignore**: Git exclusion rules
- **.npmrc**: npm configuration

## Deployment Architecture

### Local Development
- **Node.js Server**: Direct execution via npm scripts
- **Port**: 3000 (configurable)
- **Transport**: HTTP on localhost
- **MCP Inspector**: Testing tool for development

### Production (EC2 - Live)
- **Instance**: i-0d648adfb366a8889 (us-west-1)
- **Public IP**: 52.9.99.47 (Elastic IP: eipalloc-0bba57986860e351c)
- **Domain**: mcp.connectingib.com
- **Endpoint**: https://mcp.connectingib.com/mcp
- **Node.js**: v24.10.0
- **nginx**: 1.18.0 (reverse proxy with SSL termination)
- **SSL**: Let's Encrypt (expires 2026-01-17, auto-renewal enabled)
- **Process Manager**: PM2 (ib-mcp-server)
- **Status**: Running and verified ✓

### Infrastructure Components
- **EC2 Instance**: Ubuntu 22.04 LTS (ami-04f34746e5e1ec0fe)
- **PM2**: Process manager with auto-restart
- **nginx**: Reverse proxy with SSL termination
- **Certbot**: Automated SSL certificate management (Let's Encrypt)
- **Route53**: DNS management (hosted zone Z03615543P0I2I61FMLSP)
- **Security Group**: sg-016b96bf0ebfadfd2 (ports 22, 80, 443, 3000, 4001)
- **Installation Path**: /opt/ib-api-tools-mcp-server

### Infrastructure Components (Planned)
- **CloudWatch**: Logging and monitoring
- **Load Balancer**: For high availability (future)

## Security Features

### Authentication
- **OAuth 2.0**: Industry-standard authentication
- **PKCE**: Proof Key for Code Exchange (enhanced security)
- **JWT Tokens**: Signed access tokens with expiry
- **Refresh Tokens**: Session renewal without re-authentication

### Network Security
- **HTTPS**: Required for production
- **CORS**: Configurable origin whitelist
- **DNS Rebinding Protection**: Origin and host validation
- **Firewall**: Port restrictions via UFW

### Data Protection
- **Environment Variables**: Sensitive configuration not in code
- **Token Storage**: Secure client-side storage
- **Session Timeout**: Automatic expiry and cleanup

## Testing Strategy

### Development Testing
- **Local Server**: npm run dev for live testing
- **MCP Inspector**: Interactive tool testing
- **TypeScript**: Compile-time type checking
- **Build Verification**: Ensure clean builds before deployment

### Integration Testing
- **OAuth Flow**: End-to-end authentication testing
- **Token Management**: Refresh and expiry handling
- **API Proxy**: Verify proxied IntelligenceBank API calls
- **Error Handling**: Test failure scenarios

### Production Testing
- **MCP Protocol**: Initialize and tools/list verified ✓
- **HTTPS Endpoint**: curl POST to https://mcp.connectingib.com/mcp ✓
- **SSL Certificate**: Let's Encrypt verified ✓
- **Tools Available**: auth_login, auth_exchange, auth_status ✓
- **Claude Desktop**: Configuration in mcp_settings_production.json
- **Next**: End-to-end OAuth flow testing, Claude desktop integration

### Production Testing (Future)
- **Performance**: Load and response time benchmarking
- **Monitoring**: Health checks and uptime tracking

## Performance Considerations

### Optimization Techniques
- **Stateless Transport**: Simplified scaling
- **Connection Pooling**: nginx upstream configuration
- **Keep-Alive**: Persistent connections
- **Compression**: gzip for response bodies (nginx)

### Scalability Options
- **Horizontal Scaling**: Multiple EC2 instances with load balancer
- **Auto Scaling**: AWS Auto Scaling groups
- **Caching**: Redis for token/session caching
- **Rate Limiting**: Express middleware for API protection

## Future Enhancements

### Planned Improvements
- Additional IntelligenceBank API tools (resources, search, workflows)
- Token refresh automation
- Enhanced error handling and retry logic
- Comprehensive logging and monitoring
- Rate limiting and quota management

### Potential Additions
- Automated testing suite (unit, integration, e2e)
- CI/CD pipeline (GitHub Actions)
- Docker containerization
- Kubernetes orchestration
- Health check endpoints
- Metrics collection (Prometheus)
- APM integration (DataDog, New Relic)

## External Dependencies

### OAuth Bridge
- **Repository**: ib-oauth-bridge-experimental
- **Service**: AWS Lambda + API Gateway
- **Purpose**: Managed OAuth 2.0 authentication for IntelligenceBank

### IntelligenceBank API
- **Platform**: Customer-specific instances
- **Authentication**: OAuth 2.0 via bridge
- **Access**: Proxied through bridge for security

### MCP Ecosystem
- **Protocol**: Model Context Protocol (MCP)
- **Clients**: Claude Desktop, Cursor, custom implementations
- **Inspector**: Developer testing tool from Anthropic