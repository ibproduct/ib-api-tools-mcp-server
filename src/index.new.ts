#!/usr/bin/env node
/**
 * Refactored IntelligenceBank API Tools MCP Server
 * This file replaces the monolithic index.ts with a modular structure
 * All logic remains the same - just reorganized into separate modules
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Import our modularized components
import { SessionManager } from './session/SessionManager.js';
import { OAuthCallbackHandler } from './auth/oauth-callback.js';
import { createExpressApp } from './server/express-setup.js';
import { ToolRegistry } from './core/tool-registry.js';

// Import tools
import { AuthLoginTool } from './tools/auth-login.tool.js';
import { AuthStatusTool } from './tools/auth-status.tool.js';
import { ApiCallTool } from './tools/api-call.tool.js';

// ============================================================================
// Initialize Components
// ============================================================================

// Create session manager instance
const sessionManager = new SessionManager();

// Create OAuth callback handler
const oauthCallbackHandler = new OAuthCallbackHandler(sessionManager);

// Create tool registry
const toolRegistry = new ToolRegistry();

// ============================================================================
// Register Tools
// ============================================================================

// Register authentication tools
toolRegistry.register(new AuthLoginTool(sessionManager));
toolRegistry.register(new AuthStatusTool(sessionManager));
toolRegistry.register(new ApiCallTool(sessionManager));

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
    name: 'IntelligenceBank API Tools',
    version: '0.2.0'
});

// Register all tools with the MCP server
toolRegistry.registerWithMcpServer(server);

// ============================================================================
// Express App Setup
// ============================================================================

const app = createExpressApp();

// OAuth callback endpoint
app.get('/callback', async (req, res) => {
    await oauthCallbackHandler.handleCallback(req, res);
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
            enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION === 'true',
            allowedHosts: process.env.ALLOWED_HOSTS?.split(',') || []
        });

        res.on('close', () => {
            transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

// ============================================================================
// Server Startup
// ============================================================================

const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
    console.log(`IntelligenceBank API Tools MCP Server running on http://localhost:${port}/mcp`);
    console.log(`OAuth callback endpoint: http://localhost:${port}/callback`);
    console.log('Available tools:');
    console.log('  - auth_login: Start OAuth 2.0 login flow');
    console.log('  - auth_status: Check authentication status');
    console.log('  - api_call: Make authenticated API calls with automatic token refresh');
}).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    sessionManager.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    sessionManager.destroy();
    process.exit(0);
});