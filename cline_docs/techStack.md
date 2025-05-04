# Technology Stack

## Core Technologies

### MCP Framework
- @modelcontextprotocol/sdk v1.11.0
  - StdioServerTransport for agent communication
  - Tool registration and handling
  - JSON-RPC message processing

### Runtime
- Node.js >= 18.0.0
- TypeScript 5.3.3
- ESM modules

### Dependencies
- open: Browser interaction for auth flow
- zod: Runtime type validation
- tsx: TypeScript execution and watch mode

## Development Tools

### Build System
- TypeScript compiler
- npm scripts for automation
- Installation scripts for dev/prod

### Environment Management
- Separate dev/prod installations
- Environment variables via .env
- VSCode MCP settings configuration

### Version Control
- Git
- GitHub repository
- Conventional commit messages

## Project Organization

### Source Code
- TypeScript for type safety
- ESM modules for modern JS
- Clear separation of concerns

### Documentation
- Markdown files in cline_docs/
- Clear workflow documentation
- Up-to-date API documentation

### Installation
- Automated installation scripts
- Environment-specific configurations
- Easy deployment process

## Development Environment

### Requirements
- Node.js >= 18.0.0
- npm
- VSCode with Cline extension

### Configuration Files
- tsconfig.json: TypeScript settings
- package.json: Dependencies and scripts
- .env: Environment variables

### MCP Settings
- Separate dev/prod servers
- Environment-specific configurations
- Easy switching between environments

## Testing Strategy

### Development Testing
- Test in dev environment first
- Use dev MCP server
- Verify changes locally

### Production Deployment
- Test thoroughly in dev
- Use installation scripts
- Verify in production

## Future Considerations

### Planned Improvements
- Additional IB API tools
- Enhanced error handling
- More comprehensive testing

### Potential Additions
- Automated testing
- CI/CD pipeline
- Version management