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
import { setupUploadEndpoint, cleanupAllFiles } from './server/upload-handler.js';

// Import tools
import { AuthLoginTool } from './tools/auth-login.tool.js';
import { AuthStatusTool } from './tools/auth-status.tool.js';
import { ApiCallTool } from './tools/api-call.tool.js';
import { BrowserLoginStartTool, BrowserLoginCompleteTool } from './tools/browser-login.tool.js';
import { UploadFileTool } from './tools/upload-file.tool.js';
import { GetComplianceFiltersTool } from './tools/get-compliance-filters.tool.js';
import { RunFileComplianceReviewTool } from './tools/run-file-compliance-review.tool.js';

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

// Register browser login tools
toolRegistry.register(new BrowserLoginStartTool(sessionManager));
toolRegistry.register(new BrowserLoginCompleteTool(sessionManager));

// Register file upload tool (REQUIRED for remote server compliance reviews)
toolRegistry.register(new UploadFileTool());

// Register compliance review tools
toolRegistry.register(new GetComplianceFiltersTool(sessionManager));
toolRegistry.register(new RunFileComplianceReviewTool(sessionManager));

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
    name: 'IntelligenceBank API Tools',
    version: '0.2.0'
});

// Register all tools with the MCP server
toolRegistry.registerWithMcpServer(server);

// Register MCP Prompt for compliance review guidance
server.registerPrompt('compliance_review_help', {
    title: 'Run File Compliance Review',
    description: 'Get help running a compliance review on your files to check for brand, legal, and regulatory risks'
}, async () => {
    return {
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: `I'd like to run a compliance review on a file. Here's what you should help me with:

1. First, use get_compliance_filters to show me available category filters (like Channel, Market, Region)
2. Ask me which file I want to review
3. Ask me which category filters I want to apply (optional but recommended for accurate results)
4. Use run_file_compliance_review to start the review - this will:
   - Upload my file
   - Create the compliance review with my selected filters
   - Wait for the review to complete (typically 2-3 minutes)
   - Show me all compliance findings with details about:
     - Terms that triggered risks
     - Explanations of each risk
     - Relevant sentences and page locations
     - Rule names and descriptions
     - Any additional feedback

Please guide me through this process step by step.`
                }
            }
        ]
    };
});

// ============================================================================
// Express App Setup
// ============================================================================

const app = createExpressApp();

// Setup file upload endpoint
setupUploadEndpoint(app);

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
    console.log(`File upload endpoint: http://localhost:${port}/upload`);
    console.log('Available tools:');
    console.log('  - auth_login: Start OAuth 2.0 login flow');
    console.log('  - auth_status: Check authentication status');
    console.log('  - api_call: Make authenticated API calls with automatic token refresh');
    console.log('  - browser_login_start: Start browser-based direct login (alternative to OAuth)');
    console.log('  - browser_login_complete: Complete browser-based login after user authentication');
    console.log('  - upload_file: Upload files for compliance reviews (REQUIRED for remote server)');
    console.log('  - get_compliance_filters: Get available category filters for compliance reviews');
    console.log('  - run_file_compliance_review: Run comprehensive file compliance review');
    console.log('');
    console.log('Available prompts:');
    console.log('  - compliance_review_help: Guided workflow for running file compliance reviews');
}).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    sessionManager.destroy();
    await cleanupAllFiles();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    sessionManager.destroy();
    await cleanupAllFiles();
    process.exit(0);
});