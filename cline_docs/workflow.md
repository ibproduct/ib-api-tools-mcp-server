# Development Workflow

This document outlines our development workflow for the IntelligenceBank API Tools MCP server.

## Environment Structure

We maintain two separate environments:

1. **Development Environment** (`ib-api-tools-dev`)
   - Location: `~/Documents/Cline/MCP/ib-api-tools-dev`
   - Purpose: Testing changes during development
   - MCP Server Name: `ib-api-tools-dev`

2. **Production Environment** (`ib-api-tools`)
   - Location: `~/Documents/Cline/MCP/ib-api-tools`
   - Purpose: Stable, released version
   - MCP Server Name: `ib-api-tools`

## Development Process

1. **Make Code Changes**
   - Work in the source repository: `/Users/charly/Workspace/mcp/mcp-server-ib-api-tools`
   - Edit source files in the `src/` directory
   - Update documentation in `cline_docs/` as needed

2. **Test Changes**
   ```bash
   # Install to dev environment
   npm run dev:install

   # Test using dev server
   use_mcp_tool ib-api-tools-dev auth.login {}
   ```

3. **Update Documentation**
   - Update relevant files in `cline_docs/`
   - Keep `README.md` current
   - Document new tools or changes

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```

5. **Deploy to Production**
   ```bash
   # After changes are tested and committed
   npm run prod:install
   ```

## Installation Scripts

1. **dev-install.sh**
   - Builds the project
   - Installs to dev location
   - Updates dev environment

2. **prod-install.sh**
   - Builds the project
   - Installs to production location
   - Updates production environment

## MCP Settings

Your VSCode MCP settings should include both environments:

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
    },
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

## Environment Files

1. Create `.env` files in both locations:
   ```bash
   # Development
   cp .env.example ~/Documents/Cline/MCP/ib-api-tools-dev/.env

   # Production
   cp .env.example ~/Documents/Cline/MCP/ib-api-tools/.env
   ```

2. Edit each `.env` file to set the appropriate `IB_API_URL`

## Best Practices

1. **Always Test in Dev First**
   - Make changes
   - Install to dev environment
   - Test thoroughly
   - Only then deploy to production

2. **Keep Documentation Updated**
   - Update `cline_docs/` files
   - Document new tools
   - Keep workflow documentation current

3. **Use Proper Git Workflow**
   - Meaningful commit messages
   - Regular commits
   - Push changes to GitHub

4. **Maintain Environment Separation**
   - Use dev for testing
   - Use prod for stable releases
   - Keep both environments configured properly