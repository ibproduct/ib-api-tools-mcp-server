#!/bin/bash

# Build and install to production MCP location
echo "Building and installing to production MCP location..."

# Build
npm run build

# Create production MCP directory if it doesn't exist
mkdir -p ~/Documents/Cline/MCP/ib-api-tools

# Copy entire dist directory with modular structure
cp -r package.json dist ~/Documents/Cline/MCP/ib-api-tools/

# Install production dependencies
cd ~/Documents/Cline/MCP/ib-api-tools
npm install --production

echo "Done! Update your mcp_settings.json to use ib-api-tools for production."
echo "Note: The new modular structure includes subdirectories in dist/"