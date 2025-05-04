# Codebase Summary

## Project Structure
```
/
├── cline_docs/           # Project documentation
│   ├── currentTask.md    # Current focus and next steps
│   ├── projectRoadmap.md # High-level goals and progress
│   ├── workflow.md       # Development workflow guide
│   └── ...
├── scripts/             # Installation scripts
│   ├── dev-install.sh   # Development installation
│   └── prod-install.sh  # Production installation
└── src/                # Source code
    ├── auth.ts         # Authentication implementation
    ├── index.ts        # Main MCP server
    └── types.ts        # TypeScript types
```

## Key Components

### MCP Server
- Uses `@modelcontextprotocol/sdk` version 1.11.0
- Implements StdioServerTransport for agent communication
- Provides tools for IB API interaction

### Authentication Flow
- Browser-based login using IB API
- Token management and session handling
- Polling for login completion

### Development Infrastructure
- Separate dev/prod environments
- Installation scripts for easy deployment
- Clear workflow documentation

## Recent Changes
- Added browser-based authentication
- Set up development workflow
- Created installation scripts
- Added comprehensive documentation

## Dependencies
- @modelcontextprotocol/sdk: MCP implementation
- open: Browser interaction
- zod: Runtime type validation

## Installation Locations
- Development: `~/Documents/Cline/MCP/ib-api-tools-dev`
- Production: `~/Documents/Cline/MCP/ib-api-tools`

## Configuration
- Environment variables in `.env`
- MCP settings in VSCode configuration
- Separate dev/prod server configurations

## Development Process
See `workflow.md` for detailed development process documentation.