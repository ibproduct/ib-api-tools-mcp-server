# Development Workflow

This document outlines the complete development workflow for the IntelligenceBank API Tools MCP Server, including local development, testing, and production deployment.

## Architecture Overview

The MCP server uses:
- **Transport**: Streamable HTTP (remote access via POST/GET)
- **Authentication**: OAuth 2.0 Authorization Code Flow with PKCE
- **OAuth Bridge**: AWS Lambda service at `https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev`
- **Deployment**: EC2 instance with nginx reverse proxy

## Local Development Setup

### Prerequisites

- Node.js >= 24.0.0
- npm >= 8.0.0
- Git

### Initial Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/ibproduct/ib-api-tools-mcp-server.git
   cd ib-api-tools-mcp-server
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   
   Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` for local development:
   ```bash
   # OAuth Bridge Configuration
   OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
   OAUTH_CLIENT_ID=ib-api-tools-mcp-server
   OAUTH_REDIRECT_URI=http://localhost:3000/callback

   # MCP Server Configuration
   PORT=3000
   NODE_ENV=development

   # CORS Configuration
   ALLOWED_ORIGINS=*

   # DNS Rebinding Protection
   ENABLE_DNS_REBINDING_PROTECTION=true
   ALLOWED_HOSTS=127.0.0.1,localhost
   ```

### Development Commands

```bash
# Build project
npm run build

# Run in development mode (auto-rebuild on changes)
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Local Testing

1. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   Server will be available at `http://localhost:3000/mcp`

2. **Test with MCP Inspector**
   ```bash
   npx @modelcontextprotocol/inspector
   ```
   
   Connect to: `http://localhost:3000/mcp`

3. **Test OAuth Flow**
   
   In MCP Inspector:
   
   a. Call `auth.login` tool (optionally with `platformUrl`)
   b. Open the returned authorization URL in a browser
   c. Complete the OAuth login flow
   d. Call `auth.exchange` with the code and codeVerifier
   e. Call `auth.status` with the access token

### Claude Desktop Testing

Add to Claude desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ib-api-tools-dev": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Restart Claude desktop and verify the connection.

## Development Workflow

### Making Changes

1. **Create Feature Branch** (optional)
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Code Changes**
   - Edit source files in `src/`
   - Update tests if needed
   - Follow TypeScript best practices

3. **Test Changes Locally**
   ```bash
   npm run build
   npm run dev
   ```
   
   Test with MCP Inspector or Claude desktop.

4. **Update Documentation**
   - Update `docs/codebaseSummary.md` for structural changes
   - Update `docs/techStack.md` for technology changes
   - Update `docs/currentTask.md` for current objectives
   - Update `README.md` for user-facing changes

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "Description of changes"
   ```

6. **Push to Repository**
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Quality Standards

- **TypeScript**: Strict mode enabled, no `any` types
- **Formatting**: 4-space indentation, 100 character line width
- **Linting**: All Biome rules must pass
- **Testing**: Write tests for new tools and utilities
- **Documentation**: All tools must have clear descriptions

## Current Production Deployment

### Live Instance Details

**EC2 Instance:**
- **Instance ID**: i-0d648adfb366a8889
- **Region**: us-west-1
- **AMI**: ami-04f34746e5e1ec0fe (Ubuntu 22.04 LTS)
- **Public IP**: 52.9.99.47 (Elastic IP: eipalloc-0bba57986860e351c)
- **Domain**: mcp.connectingib.com
- **Security Group**: sg-016b96bf0ebfadfd2
- **MCP Endpoint**: https://mcp.connectingib.com/mcp

**Software Configuration:**
- Node.js v24.10.0
- nginx 1.18.0 (reverse proxy with SSL/TLS)
- PM2 process manager (process: ib-mcp-server)
- Let's Encrypt SSL certificate (auto-renewal enabled)
- Installation path: `/opt/ib-api-tools-mcp-server`
- Status: Running and verified ✓

**Access:**
```bash
# SSH access
ssh -i ~/Workspace/Keys/ib-mcp-api-tools-keypair-2025.pem ubuntu@52.9.99.47

# Check PM2 status
pm2 status
pm2 logs ib-mcp-server

# View recent logs
pm2 logs ib-mcp-server --lines 50

# Check nginx status
sudo systemctl status nginx

# Check SSL certificate
sudo certbot certificates
```

**Production Environment (.env):**
```bash
OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
OAUTH_CLIENT_ID=ib-api-tools-mcp-server-prod
OAUTH_REDIRECT_URI=https://mcp.connectingib.com/callback
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=*
ENABLE_DNS_REBINDING_PROTECTION=false
ALLOWED_HOSTS=localhost,mcp.connectingib.com,52.9.99.47
```

**Security Group Ports:**
- 22 (SSH): Specific IPs including 49.185.106.0/32
- 80 (HTTP): 0.0.0.0/0
- 443 (HTTPS): 0.0.0.0/0
- 3000 (MCP): 0.0.0.0/0
- 4001 (Optional): 0.0.0.0/0

**DNS Configuration:**
- Route53 A record: mcp.connectingib.com → 52.9.99.47
- Hosted Zone: Z03615543P0I2I61FMLSP (connectingib.com)

**SSL/TLS Configuration:**
- Certificate: Let's Encrypt
- Certificate Path: `/etc/letsencrypt/live/mcp.connectingib.com/`
- Expires: 2026-01-17
- Auto-renewal: Enabled via systemd timer

**nginx Configuration:**
- Site config: `/etc/nginx/sites-available/ib-mcp-server`
- Reverse proxy: localhost:3000
- SSL termination with HTTP → HTTPS redirect
- SSE/streaming support enabled

**Verified Functionality:**
```bash
# Test HTTPS endpoint
curl -I https://mcp.connectingib.com/mcp

# MCP protocol initialize test
curl -X POST https://mcp.connectingib.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

# Tools list test
curl -X POST https://mcp.connectingib.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Response: All three tools (auth.login, auth.exchange, auth.status) available ✓
```

### Updating Production Instance

**Note**: The EC2 production server only needs the compiled code (`dist/`), runtime dependencies (`node_modules/`), and configuration files (`.env`). Documentation files in `docs/` are for developers working on the repository and are not required on the production server.

1. **Pull Latest Code Changes Only**
   ```bash
   ssh -i ~/Workspace/Keys/ib-mcp-api-tools-keypair-2025.pem ubuntu@52.9.99.47
   cd /opt/ib-api-tools-mcp-server
   
   # Pull only source code changes (src/, package.json, tsconfig.json)
   sudo git pull origin main
   
   # Install any new dependencies
   sudo npm install
   
   # Rebuild application
   sudo npm run build
   
   # Restart the server
   pm2 restart ib-mcp-server
   
   # Verify the update
   pm2 logs ib-mcp-server --lines 20
   ```

2. **Verify Update**
   ```bash
   # Check HTTPS MCP endpoint is responding
   curl -X POST https://mcp.connectingib.com/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'
   ```

**What Gets Deployed to EC2:**
- `/opt/ib-api-tools-mcp-server/src/` - Source code
- `/opt/ib-api-tools-mcp-server/dist/` - Compiled JavaScript (built from src/)
- `/opt/ib-api-tools-mcp-server/node_modules/` - Runtime dependencies
- `/opt/ib-api-tools-mcp-server/package.json` - Dependency manifest
- `/opt/ib-api-tools-mcp-server/tsconfig.json` - TypeScript configuration
- `/opt/ib-api-tools-mcp-server/.env` - Production environment variables

**What Stays in Repository Only:**
- `/docs/*` - Developer documentation (not needed for runtime)
- `README.md` - Project overview (reference only)
- `.env.example` - Environment template (not used in production)
- `mcp_settings*.json` - Client configuration examples (not server-side)

## Production Deployment (EC2)

### Prerequisites

- EC2 instance with Ubuntu/Debian
- Domain name configured (e.g., `mcp.intelligencebank.com`)
- SSL certificate for HTTPS
- OAuth bridge running and accessible

### Initial EC2 Setup

1. **SSH into EC2**
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

2. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Install PM2**
   ```bash
   sudo npm install -g pm2
   ```

4. **Install nginx**
   ```bash
   sudo apt-get install nginx
   ```

### Application Deployment

**Important**: The production server only requires compiled code and runtime dependencies. Documentation files (`docs/`, `README.md`) are for developers and are not needed on the server.

1. **Clone Repository**
   ```bash
   cd /opt
   sudo git clone https://github.com/ibproduct/ib-api-tools-mcp-server.git
   cd ib-api-tools-mcp-server
   ```

2. **Install Production Dependencies**
   ```bash
   # Install only production dependencies (no devDependencies)
   sudo npm install --production
   ```

3. **Build Application**
   ```bash
   # Temporarily install build dependencies
   sudo npm install --only=dev
   
   # Build the application
   sudo npm run build
   
   # Remove dev dependencies to save space
   sudo npm prune --production
   ```

4. **Create Production Environment File**
   ```bash
   sudo nano .env
   ```

   Production `.env`:
   ```bash
   # OAuth Bridge Configuration
   OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
   OAUTH_CLIENT_ID=ib-api-tools-mcp-server-prod
   OAUTH_REDIRECT_URI=https://mcp.intelligencebank.com/callback

   # MCP Server Configuration
   PORT=3000
   NODE_ENV=production

   # CORS Configuration
   ALLOWED_ORIGINS=https://claude.ai,https://cursor.com

   # DNS Rebinding Protection
   ENABLE_DNS_REBINDING_PROTECTION=true
   ALLOWED_HOSTS=mcp.intelligencebank.com
   ```

5. **Start with PM2**
   ```bash
   pm2 start dist/index.js --name ib-mcp-server
   pm2 save
   pm2 startup
   ```

### nginx Configuration

1. **Create nginx Site Configuration**
   ```bash
   sudo nano /etc/nginx/sites-available/ib-mcp-server
   ```

   Configuration:
   ```nginx
   upstream mcp_server {
       server localhost:3000;
       keepalive 64;
   }

   server {
       listen 80;
       server_name mcp.intelligencebank.com;
       
       # Redirect to HTTPS
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name mcp.intelligencebank.com;

       # SSL Configuration
       ssl_certificate /etc/letsencrypt/live/mcp.intelligencebank.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/mcp.intelligencebank.com/privkey.pem;
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers HIGH:!aNULL:!MD5;
       ssl_prefer_server_ciphers on;

       # Security headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;

       # MCP endpoint
       location /mcp {
           proxy_pass http://mcp_server;
           proxy_http_version 1.1;
           
           # WebSocket/SSE support
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           
           # Headers
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           
           # Timeouts for long-running requests
           proxy_read_timeout 300s;
           proxy_send_timeout 300s;
           
           # Buffering
           proxy_buffering off;
           proxy_cache off;
       }

       # OAuth callback endpoint
       location /callback {
           proxy_pass http://mcp_server;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

2. **Enable Site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/ib-mcp-server /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

### SSL Certificate Setup

1. **Install Certbot**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   ```

2. **Obtain Certificate**
   ```bash
   sudo certbot --nginx -d mcp.intelligencebank.com
   ```

3. **Verify Auto-Renewal**
   ```bash
   sudo certbot renew --dry-run
   ```

### Firewall Configuration

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Updating Production Deployment

### Standard Update Process

1. **SSH into EC2**
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

2. **Navigate to Application Directory**
   ```bash
   cd /opt/ib-api-tools-mcp-server
   ```

3. **Pull Latest Changes**
   ```bash
   sudo git pull origin main
   ```
   
   **Note**: This pulls all files including documentation, but only the source code and build output are used by the running server.

4. **Install/Update Dependencies** (if package.json changed)
   ```bash
   # Install production dependencies
   sudo npm install --production
   ```

5. **Rebuild Application**
   ```bash
   # Install dev dependencies for build
   sudo npm install --only=dev
   
   # Build
   sudo npm run build
   
   # Clean up dev dependencies
   sudo npm prune --production
   ```

6. **Restart PM2 Process**
   ```bash
   pm2 restart ib-mcp-server
   ```

7. **Verify Deployment**
   ```bash
   pm2 status
   pm2 logs ib-mcp-server --lines 50
   ```

### Rollback Procedure

If deployment fails:

```bash
# View recent commits
sudo git log --oneline -5

# Rollback to previous commit
sudo git reset --hard <commit-hash>

# Rebuild and restart
sudo npm install
sudo npm run build
pm2 restart ib-mcp-server
```

## Monitoring and Maintenance

### View Logs

```bash
# PM2 logs
pm2 logs ib-mcp-server

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Monitor Resources

```bash
# PM2 monitoring dashboard
pm2 monit

# System resources
htop
```

### Restart Services

```bash
# Restart MCP server
pm2 restart ib-mcp-server

# Restart nginx
sudo systemctl restart nginx

# Restart both
pm2 restart ib-mcp-server && sudo systemctl restart nginx
```

## Testing Production Deployment

### Health Check

```bash
curl -I https://mcp.connectingib.com/mcp
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector https://mcp.connectingib.com/mcp
```

### Claude Desktop

Update configuration to use production URL:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "intelligencebank-api-tools": {
      "url": "https://mcp.connectingib.com/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

Restart Claude desktop and test the connection.

### OAuth Flow Verification

1. Use `auth.login` tool in Claude
2. Open authorization URL
3. Complete OAuth flow
4. Use `auth.exchange` to get tokens
5. Use `auth.status` to verify authentication

## Troubleshooting

### Server Not Starting

**Check PM2 logs:**
```bash
pm2 logs ib-mcp-server --err
```

**Verify environment:**
```bash
cat .env
```

**Check port availability:**
```bash
sudo lsof -i :3000
```

### OAuth Flow Failing

**Verify OAuth bridge accessibility:**
```bash
curl https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev/authorize
```

**Check redirect URI configuration:**
- Verify `.env` OAUTH_REDIRECT_URI matches expected callback URL
- Ensure CORS settings allow your client origin

**Review PKCE parameters:**
- code_verifier must be the same value used in login and exchange
- state parameter must match (if provided)

### SSL Certificate Issues

**Check certificate status:**
```bash
sudo certbot certificates
```

**Renew manually:**
```bash
sudo certbot renew
```

**Verify nginx SSL configuration:**
```bash
sudo nginx -t
```

### nginx Issues

**Test configuration:**
```bash
sudo nginx -t
```

**Check logs:**
```bash
sudo tail -f /var/log/nginx/error.log
```

**Restart nginx:**
```bash
sudo systemctl restart nginx
```

### Build Errors

**Clear build cache:**
```bash
rm -rf dist node_modules
npm install
npm run build
```

**Verify TypeScript compilation:**
```bash
npx tsc --noEmit
```

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use different credentials for development and production
   - Rotate credentials regularly

2. **SSL/TLS**
   - Always use HTTPS in production
   - Keep certificates up to date
   - Use strong cipher suites

3. **CORS**
   - Restrict `ALLOWED_ORIGINS` to known client domains
   - Never use `*` in production

4. **DNS Rebinding Protection**
   - Enable in production: `ENABLE_DNS_REBINDING_PROTECTION=true`
   - Specify allowed hosts: `ALLOWED_HOSTS=mcp.intelligencebank.com`

5. **Firewall**
   - Only expose necessary ports (22, 80, 443)
   - Use security groups on EC2

6. **Updates**
   - Keep dependencies updated: `npm audit`
   - Update OS packages regularly: `sudo apt update && sudo apt upgrade`

7. **Monitoring**
   - Set up log aggregation
   - Configure alerts for errors
   - Monitor resource usage

## Performance Optimization

### Caching

Consider implementing Redis for:
- Token caching
- Session management
- Rate limiting

### Load Balancing

For high traffic:
1. Use AWS ELB with multiple EC2 instances
2. Configure Auto Scaling groups
3. Implement health checks

### Rate Limiting

Add rate limiting middleware:
```bash
npm install express-rate-limit
```

## Backup and Recovery

### Backup Configuration

```bash
# Backup environment
sudo cp .env .env.backup

# Backup nginx config
sudo cp /etc/nginx/sites-available/ib-mcp-server /etc/nginx/sites-available/ib-mcp-server.backup

# Backup PM2 configuration
pm2 save
```

### Recovery

```bash
# Restore environment
sudo cp .env.backup .env

# Restore nginx config
sudo cp /etc/nginx/sites-available/ib-mcp-server.backup /etc/nginx/sites-available/ib-mcp-server
sudo systemctl restart nginx

# Restore PM2 processes
pm2 resurrect
```

## Support and Resources

### Documentation
- Project README: `README.md`
- Technical Stack: `docs/techStack.md`
- Codebase Summary: `docs/codebaseSummary.md`
- Current Tasks: `docs/currentTask.md`

### External Resources
- MCP SDK Documentation: https://modelcontextprotocol.io
- OAuth 2.0 Specification: https://oauth.net/2/
- Express.js Documentation: https://expressjs.com

### Getting Help
1. Check logs: `pm2 logs ib-mcp-server`
2. Review documentation in `docs/`
3. Open GitHub issue: https://github.com/ibproduct/ib-api-tools-mcp-server/issues