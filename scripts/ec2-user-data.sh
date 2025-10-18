#!/bin/bash
set -e

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 24.x
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install nginx
apt-get install -y nginx

# Install git
apt-get install -y git

# Create application directory
mkdir -p /opt/ib-api-tools-mcp-server
cd /opt/ib-api-tools-mcp-server

# Clone repository
git clone https://github.com/ibproduct/ib-api-tools-mcp-server.git .

# Install dependencies
npm install

# Build application
npm run build

# Create production .env file
cat > .env << 'EOF'
OAUTH_BRIDGE_URL=https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev
OAUTH_CLIENT_ID=ib-api-tools-mcp-server-prod
OAUTH_REDIRECT_URI=http://52.9.99.47:3000/callback
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=*
ENABLE_DNS_REBINDING_PROTECTION=false
ALLOWED_HOSTS=52.9.99.47,localhost
EOF

# Start application with PM2
pm2 start dist/index.js --name ib-mcp-server
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Enable PM2 on system startup
env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "MCP Server installation complete!"