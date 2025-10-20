#!/bin/bash
# EC2 Deployment Script for Modular Structure
# Handles the deployment of the refactored MCP server to EC2

set -e

echo "=============================================="
echo "EC2 Deployment - Refactored Modular Structure"
echo "=============================================="

# Configuration
KEY_PATH="$HOME/Workspace/Keys/ib-mcp-api-tools-keypair-2025.pem"
EC2_HOST="ubuntu@52.9.99.47"
REMOTE_DIR="/opt/ib-api-tools-mcp-server"
CURRENT_IP="49.255.135.66"

echo ""
echo "Pre-deployment checklist:"
echo "-------------------------"
echo "1. Your current IP: $CURRENT_IP"
echo "2. EC2 Instance: 52.9.99.47"
echo "3. Key file: $KEY_PATH"
echo ""
echo "IMPORTANT: If SSH fails, you need to update the EC2 security group:"
echo "  1. Go to AWS Console > EC2 > Security Groups"
echo "  2. Find security group: sg-016b96bf0ebfadfd2"
echo "  3. Edit inbound rules for SSH (port 22)"
echo "  4. Add your current IP: $CURRENT_IP/32"
echo ""
read -p "Press Enter to continue with deployment..."

echo ""
echo "Step 1: Building TypeScript project..."
echo "---------------------------------------"
npm run build

echo ""
echo "Step 2: Creating deployment package..."
echo "---------------------------------------"
# Create a deployment package with the entire dist directory
tar -czf dist-deploy.tar.gz dist/ package.json package-lock.json

echo "Package created: dist-deploy.tar.gz"
ls -lh dist-deploy.tar.gz

echo ""
echo "Step 3: Testing SSH connection..."
echo "---------------------------------------"
if ssh -i "$KEY_PATH" -o ConnectTimeout=5 "$EC2_HOST" "echo 'SSH connection successful'" 2>/dev/null; then
    echo "✅ SSH connection successful"
else
    echo "❌ SSH connection failed!"
    echo ""
    echo "Please update the EC2 security group to allow SSH from your IP: $CURRENT_IP"
    echo "Then run this script again."
    rm -f dist-deploy.tar.gz
    exit 1
fi

echo ""
echo "Step 4: Copying deployment package to EC2..."
echo "---------------------------------------"
scp -i "$KEY_PATH" dist-deploy.tar.gz "$EC2_HOST:/tmp/"

echo ""
echo "Step 5: Deploying on EC2 server..."
echo "---------------------------------------"
ssh -i "$KEY_PATH" "$EC2_HOST" << 'REMOTE_COMMANDS'
set -e

echo "Creating backup of current deployment..."
if [ -d "/opt/ib-api-tools-mcp-server/dist" ]; then
    sudo tar -czf "/tmp/dist-backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
        -C /opt/ib-api-tools-mcp-server dist
    echo "Backup created"
fi

echo "Removing old dist directory..."
sudo rm -rf /opt/ib-api-tools-mcp-server/dist

echo "Extracting new deployment..."
sudo tar -xzf /tmp/dist-deploy.tar.gz -C /opt/ib-api-tools-mcp-server/

echo "Setting permissions..."
sudo chown -R ubuntu:ubuntu /opt/ib-api-tools-mcp-server/dist

echo "Installing any new dependencies..."
cd /opt/ib-api-tools-mcp-server
sudo npm ci --production || sudo npm install --production

echo "Restarting PM2 process..."
pm2 restart ib-mcp-server

echo "Waiting for server to start..."
sleep 5

echo ""
echo "Checking server status..."
pm2 status ib-mcp-server

echo ""
echo "Recent logs:"
pm2 logs ib-mcp-server --lines 20 --nostream

echo ""
echo "Testing MCP endpoint..."
response=$(curl -s -w "\n%{http_code}" -X POST https://mcp.connectingib.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"deployment-test","version":"1.0.0"}}}' \
  2>/dev/null | tail -n1)

if [ "$response" == "200" ]; then
    echo "✅ MCP endpoint responding correctly (HTTP 200)"
else
    echo "⚠️  MCP endpoint returned HTTP $response"
fi

# Cleanup
rm -f /tmp/dist-deploy.tar.gz
echo ""
echo "Deployment completed on EC2!"

REMOTE_COMMANDS

# Cleanup local package
rm -f dist-deploy.tar.gz

echo ""
echo "=============================================="
echo "✅ Deployment completed successfully!"
echo "=============================================="
echo ""
echo "The refactored modular structure is now deployed:"
echo "  - Main entry: dist/index.js"
echo "  - Modules: dist/types/, dist/session/, dist/auth/, dist/tools/, dist/core/, dist/server/"
echo "  - URL: https://mcp.connectingib.com/mcp"
echo ""
echo "Test the deployment:"
echo "  1. MCP Inspector: npx @modelcontextprotocol/inspector https://mcp.connectingib.com/mcp"
echo "  2. View logs: ssh -i $KEY_PATH $EC2_HOST 'pm2 logs ib-mcp-server'"
echo "  3. Claude Desktop: Update config to use https://mcp.connectingib.com/mcp"