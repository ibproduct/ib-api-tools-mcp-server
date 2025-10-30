#!/usr/bin/env node
/**
 * Refactored IntelligenceBank API Tools MCP Server
 * This file replaces the monolithic index.ts with a modular structure
 * All logic remains the same - just reorganized into separate modules
 */

import 'dotenv/config';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Import our modularized components
import { SessionManager } from './session/SessionManager.js';
import { OAuthCallbackHandler } from './auth/oauth-callback.js';
import { createExpressApp } from './server/express-setup.js';
import { ToolRegistry } from './core/tool-registry.js';
import { setupUploadEndpoint, cleanupAllFiles } from './server/upload-handler.js';
import { extractBearerToken, buildWWWAuthenticateHeader } from './auth/mcp-authorization.js';
import { findOrCreateSessionFromToken } from './auth/mcp-auth-middleware.js';

// Import tools
import { AuthLoginTool } from './tools/auth-login.tool.js';
import { AuthStatusTool } from './tools/auth-status.tool.js';
import { ApiCallTool } from './tools/api-call.tool.js';
import { BrowserLoginStartTool, BrowserLoginCompleteTool } from './tools/browser-login.tool.js';
import { UploadFileTool } from './tools/upload-file.tool.js';
import { GetComplianceFiltersTool } from './tools/get-compliance-filters.tool.js';
import { RunFileComplianceReviewTool } from './tools/run-file-compliance-review.tool.js';

// Import resource handlers
import {
    handleResourceList,
    handleResourceRead
} from './resources/resource-handlers.js';

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

// ============================================================================
// MCP Resources Support
// ============================================================================

// Register a ResourceTemplate to declare the resources capability
// Simplified to only handle IntelligenceBank resources (not folders)
server.registerResource(
    'ib-resources',
    new ResourceTemplate('ib://{clientId}/resource/{resourceId}', { list: undefined }),
    {
        title: 'IntelligenceBank Resources',
        description: 'Browse IntelligenceBank resources with optional keyword search'
    },
    async (uri, params) => {
        // This handler won't be called because we override the list/read handlers below
        // But we need to register at least one resource to declare the capability
        return {
            contents: [{
                uri: uri.href,
                text: 'Use resources/list to browse resources'
            }]
        };
    }
);

// Now override the handlers with our custom authentication-aware implementations
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const underlyingServer = server.server;

// Override resource list handler with Authorization header support
underlyingServer.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
    const sessionId = (extra as any)?.sessionId || '';
    // Use global currentAuthHeader set by handleMcpEndpoint
    const authHeader = currentAuthHeader;
    const cursor = request.params?.cursor;
    return await handleResourceList(sessionManager, sessionId, cursor, authHeader);
});

// Override resource read handler with Authorization header support
underlyingServer.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    const sessionId = (extra as any)?.sessionId || '';
    // Use global currentAuthHeader set by handleMcpEndpoint
    const authHeader = currentAuthHeader;
    const uri = request.params.uri;
    return await handleResourceRead(sessionManager, sessionId, uri, authHeader);
});

// ============================================================================
// MCP Prompts
// ============================================================================

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

const app = createExpressApp(sessionManager);

// Setup file upload endpoint
setupUploadEndpoint(app);

// OAuth callback endpoint
app.get('/callback', async (req, res) => {
    await oauthCallbackHandler.handleCallback(req, res);
});

// Store current request in a global for access by handlers
let currentAuthHeader: string | undefined;

/**
 * Determine if a request requires authentication
 * Initialize and notifications are allowed without auth per MCP specification
 */
function shouldRequireAuth(body: any): boolean {
    if (!body || !body.method) {
        return false;
    }
    
    const method = body.method;
    
    // Allow MCP handshake and notification methods without auth
    // These are required for proper MCP client connection establishment
    if (method === 'initialize' ||
        method === 'initialized' ||
        method === 'notifications/initialized' ||
        method.startsWith('notifications/')) {
        return false;
    }
    
    // All other methods require authentication
    return true;
}

// MCP endpoint handler - supports both POST and GET for streamable-http transport
const handleMcpEndpoint = async (req: any, res: any) => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractBearerToken(authHeader);
        const serverUrl = process.env.MCP_SERVER_URL || `${req.protocol}://${req.get('host')}`;
        
        console.log('[handleMcpEndpoint] Request received:', {
            method: req.body?.method,
            id: req.body?.id,
            hasAuthHeader: !!authHeader,
            hasToken: !!token
        });
        
        // Check if this request requires authentication
        const requiresAuth = shouldRequireAuth(req.body);
        
        // If authentication is required but no token provided, return 401
        if (requiresAuth && !token) {
            console.log('Authentication required but no token provided for method:', req.body?.method);
            res.status(401)
               .set('WWW-Authenticate', buildWWWAuthenticateHeader({
                   realm: serverUrl,
                   scope: 'profile',
                   resource_metadata: `${serverUrl}/.well-known/oauth-protected-resource`
               }))
               .json({
                   jsonrpc: '2.0',
                   error: {
                       code: -32001,
                       message: 'Authentication required. Please authenticate to access this resource.'
                   },
                   id: req.body?.id || null
               });
            return;
        }
        
        // If token is provided, validate it and ensure session exists
        if (token) {
            const session = await findOrCreateSessionFromToken(sessionManager, authHeader);
            if (!session) {
                console.log('Invalid or expired token provided');
                res.status(401)
                   .set('WWW-Authenticate', buildWWWAuthenticateHeader({
                       realm: serverUrl,
                       error: 'invalid_token',
                       errorDescription: 'The access token is invalid or expired',
                       resource_metadata: `${serverUrl}/.well-known/oauth-protected-resource`
                   }))
                   .json({
                       jsonrpc: '2.0',
                       error: {
                           code: -32001,
                           message: 'Invalid or expired access token'
                       },
                       id: req.body?.id || null
                   });
                return;
            }
            console.log('Valid token provided, session:', session.sessionId);
        }
        
        // Store Authorization header globally for access by resource handlers
        currentAuthHeader = authHeader;
        
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
            enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION === 'true',
            allowedHosts: process.env.ALLOWED_HOSTS?.split(',') || []
        });

        res.on('close', () => {
            transport.close();
            currentAuthHeader = undefined;
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        currentAuthHeader = undefined;
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
};

// Register both POST and GET - StreamableHTTPServerTransport handles both
app.post('/mcp', handleMcpEndpoint);
app.get('/mcp', handleMcpEndpoint);

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
    console.log('');
    console.log('MCP Resources:');
    console.log('  - Browse IntelligenceBank resources directly');
    console.log('  - URI scheme: ib://{clientid}/resource/{resourceId}');
    console.log('  - Supports keyword search via cursor parameter');
    console.log('  - Sorted by last update time (most recent first)');
    console.log('  - Returns up to 100 resources per page');
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