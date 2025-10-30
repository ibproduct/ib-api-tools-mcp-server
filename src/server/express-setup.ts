/**
 * Express Server Setup
 * Extracted from index.ts lines 70-78
 * No logic changes - just moved to separate module
 */

import express, { Express } from 'express';
import cors from 'cors';
import {
    handleProtectedResourceMetadata,
    handleAuthorizationServerMetadata
} from '../auth/mcp-authorization.js';
import { mcpAuthMiddleware } from '../auth/mcp-auth-middleware.js';
import type { SessionManager } from '../session/SessionManager.js';

export function createExpressApp(sessionManager: SessionManager): Express {
    const app = express();
    app.use(express.json());

    // Configure CORS
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS || '*',
        exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
        allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization']
    }));

    // MCP Authorization Protocol Discovery Endpoints
    // RFC9728: OAuth 2.0 Protected Resource Metadata
    // Support both sub-path (for /mcp endpoint) and root discovery
    app.get('/.well-known/oauth-protected-resource/mcp', handleProtectedResourceMetadata);
    app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata);
    
    // RFC8414: OAuth 2.0 Authorization Server Metadata
    app.get('/.well-known/oauth-authorization-server', handleAuthorizationServerMetadata);

    // MCP Authentication Middleware
    // Intercepts resource requests and returns HTTP 401 when not authenticated
    app.use(mcpAuthMiddleware(sessionManager));

    return app;
}