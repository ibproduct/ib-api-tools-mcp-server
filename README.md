# IntelligenceBank API Tools MCP Server

An MCP server that provides tools for interacting with the IntelligenceBank API, including browser-based authentication.

## Development

### Local Development Setup

1. Clone the repository:
```bash
git clone https://github.com/ibproduct/ib-api-tools-mcp-server.git
cd ib-api-tools-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Create your .env file:
```bash
cp .env.example .env
```
Edit .env to set your IB_API_URL.

4. Install the development version to Cline MCP:
```bash
chmod +x scripts/dev-install.sh
./scripts/dev-install.sh
```

5. Configure VSCode MCP settings at `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`:

```json
{
  "mcpServers": {
    "ib-api-tools-dev": {
      "command": "node",
      "args": [
        "/Users/charly/Documents/Cline/MCP/ib-api-tools-dev/index.js"
      ],
      "env": {
        "IB_API_URL": "https://your-ib-instance.intelligencebank.com"
      },
      "disabled": false
    }
  }
}
```

### Development Workflow

1. Make changes to the source code
2. Run `./scripts/dev-install.sh` to build and install to dev MCP location
3. Test changes using the dev server:
```typescript
use_mcp_tool ib-api-tools-dev auth.login {}
```

4. When ready, commit and push to GitHub:
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

## Production Installation

For production use, install from the released version:

1. Create the installation directory:
```bash
mkdir -p ~/Documents/Cline/MCP/ib-api-tools
```

2. Install the server:
```bash
# Clone the repository
git clone https://github.com/ibproduct/ib-api-tools-mcp-server.git
cd ib-api-tools-mcp-server

# Install and build
npm install
npm run build

# Copy to production location
cp -r package.json dist/* ~/Documents/Cline/MCP/ib-api-tools/
cd ~/Documents/Cline/MCP/ib-api-tools
npm install --production
```

3. Configure VSCode MCP settings for production use:
```json
{
  "mcpServers": {
    "ib-api-tools": {
      "command": "node",
      "args": [
        "/Users/charly/Documents/Cline/MCP/ib-api-tools/index.js"
      ],
      "env": {
        "IB_API_URL": "https://your-ib-instance.intelligencebank.com"
      },
      "disabled": false
    }
  }
}
```

## Available Tools

### auth.login
Starts the browser login flow. This will:
1. Get an initial token from IB
2. Open your browser to complete login
3. Poll for completion
4. Store the session for subsequent requests

Example:
```typescript
use_mcp_tool ib-api-tools auth.login {}
```

### auth.status
Check the current authentication status.

Example:
```typescript
use_mcp_tool ib-api-tools auth.status {}
```

## License

MIT