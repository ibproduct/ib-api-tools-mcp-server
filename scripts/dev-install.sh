#!/bin/bash

# Build and install to dev MCP location
echo "Building and installing to dev MCP location..."

# Build
npm run build

# Create dev MCP directory if it doesn't exist
mkdir -p ~/Documents/Cline/MCP/ib-api-tools-dev

# Copy files
cp -r package.json dist/* ~/Documents/Cline/MCP/ib-api-tools-dev/

# Install production dependencies
cd ~/Documents/Cline/MCP/ib-api-tools-dev
npm install --production

echo "Done! Update your mcp_settings.json to use ib-api-tools-dev for development."