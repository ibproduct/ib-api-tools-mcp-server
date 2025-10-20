#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// ============================================================================
// Session Management
// ============================================================================

interface AuthSession {
    sessionId: string;
    codeVerifier: string;
    state: string;
    clientId: string;
    redirectUri: string;
    status: 'pending' | 'completed' | 'error';
    tokens?: {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
    };
    userInfo?: any;
    error?: string;
    errorDescription?: string;
    createdAt: number;
    expiresAt: number;
}

// In-memory session storage with automatic cleanup
const authSessions = new Map<string, AuthSession>();
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of authSessions.entries()) {
        if (session.expiresAt < now) {
            authSessions.delete(sessionId);
            console.log(`Cleaned up expired session: ${sessionId}`);
        }
    }
}, 60 * 1000);

function generateSessionId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function findSessionByState(state: string): AuthSession | undefined {
    for (const session of authSessions.values()) {
        if (session.state === state) {
            return session;
        }
    }
    return undefined;
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Configure CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id']
}));

// ============================================================================
// OAuth Callback Endpoint
// ============================================================================

app.get('/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    console.log('OAuth callback received:', { code: code ? 'present' : 'missing', state, error });

    // Handle OAuth errors
    if (error) {
        const session = state ? findSessionByState(state as string) : undefined;
        if (session) {
            session.status = 'error';
            session.error = error as string;
            session.errorDescription = error_description as string;
        }

        return res.send(generateErrorPage(error as string, error_description as string));
    }

    // Validate required parameters
    if (!code || !state) {
        return res.status(400).send(generateErrorPage(
            'invalid_request',
            'Missing required parameters: code and state'
        ));
    }

    // Find session by state
    const session = findSessionByState(state as string);
    if (!session) {
        return res.status(400).send(generateErrorPage(
            'invalid_state',
            'Invalid or expired authentication session. Please try again.'
        ));
    }

    try {
        // Exchange authorization code for tokens
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';
        
        console.log('Exchanging code for tokens...');
        const tokenResponse = await fetch(`${bridgeUrl}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code as string,
                redirect_uri: session.redirectUri,
                client_id: session.clientId,
                code_verifier: session.codeVerifier
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            console.error('Token exchange failed:', errorData);
            
            session.status = 'error';
            session.error = errorData.error || 'token_exchange_failed';
            session.errorDescription = errorData.error_description || 'Failed to exchange authorization code for tokens';
            
            return res.send(generateErrorPage(session.error || 'token_exchange_failed', session.errorDescription));
        }

        const tokens = await tokenResponse.json();
        console.log('Tokens received successfully');

        // Fetch user information
        console.log('Fetching user information...');
        const userInfoResponse = await fetch(`${bridgeUrl}/userinfo`, {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`
            }
        });

        let userInfo = null;
        if (userInfoResponse.ok) {
            userInfo = await userInfoResponse.json();
            console.log('User info retrieved:', userInfo.name || userInfo.sub);
        } else {
            console.warn('Failed to fetch user info, but continuing with authentication');
        }

        // Update session with tokens and user info
        session.status = 'completed';
        session.tokens = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenType: tokens.token_type,
            expiresIn: tokens.expires_in
        };
        session.userInfo = userInfo;

        console.log(`Authentication completed for session: ${session.sessionId}`);

        // Return success page
        return res.send(generateSuccessPage(userInfo));

    } catch (error) {
        console.error('Error during token exchange:', error);
        
        session.status = 'error';
        session.error = 'server_error';
        session.errorDescription = error instanceof Error ? error.message : 'An unexpected error occurred';
        
        return res.send(generateErrorPage(session.error, session.errorDescription));
    }
});

// ============================================================================
// HTML Page Generators
// ============================================================================

function generateSuccessPage(userInfo: any): string {
    const userName = userInfo?.name || userInfo?.given_name || 'User';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Successful</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 48px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .success-icon {
            width: 80px;
            height: 80px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            animation: scaleIn 0.5s ease-out;
        }
        .success-icon svg {
            width: 48px;
            height: 48px;
            stroke: white;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        .message {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .user-info {
            background: #f3f4f6;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .user-name {
            color: #1f2937;
            font-size: 18px;
            font-weight: 600;
        }
        .close-instruction {
            color: #9ca3af;
            font-size: 14px;
            font-style: italic;
        }
        @keyframes scaleIn {
            from {
                transform: scale(0);
                opacity: 0;
            }
            to {
                transform: scale(1);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">
            <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </div>
        <h1>Authentication Successful!</h1>
        <p class="message">
            You have successfully authenticated with IntelligenceBank.
        </p>
        <div class="user-info">
            <div class="user-name">Welcome, ${userName}!</div>
        </div>
        <p class="close-instruction">
            You can now close this window and return to Claude.
        </p>
    </div>
</body>
</html>`;
}

function generateErrorPage(error: string, description?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 48px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .error-icon svg {
            width: 48px;
            height: 48px;
            stroke: white;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        .message {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .error-details {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
        }
        .error-code {
            color: #991b1b;
            font-family: monospace;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .error-description {
            color: #7f1d1d;
            font-size: 14px;
        }
        .action-button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.2s;
        }
        .action-button:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">
            <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
        </div>
        <h1>Authentication Failed</h1>
        <p class="message">
            We encountered an error during the authentication process.
        </p>
        ${error || description ? `
        <div class="error-details">
            ${error ? `<div class="error-code">Error: ${error}</div>` : ''}
            ${description ? `<div class="error-description">${description}</div>` : ''}
        </div>
        ` : ''}
        <p class="message">
            Please close this window and try again in Claude.
        </p>
    </div>
</body>
</html>`;
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
    name: 'IntelligenceBank API Tools',
    version: '0.2.0'
});

// ============================================================================
// Authentication Tools
// ============================================================================

server.registerTool(
    'auth_login',
    {
        title: 'OAuth Login',
        description: 'Start OAuth 2.0 login flow with IntelligenceBank. Returns a URL for the user to visit and a session ID for tracking authentication status.',
        inputSchema: {
            platformUrl: z.string().optional().describe('IntelligenceBank platform URL (e.g., https://company.intelligencebank.com)')
        },
        outputSchema: {
            authorizationUrl: z.string(),
            sessionId: z.string(),
            instructions: z.string()
        }
    },
    async ({ platformUrl }) => {
        // Generate session and PKCE parameters
        const sessionId = generateSessionId();
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateState();

        const clientId = process.env.OAUTH_CLIENT_ID || 'ib-api-tools-mcp-server';
        const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

        // Create session
        const session: AuthSession = {
            sessionId,
            codeVerifier,
            state,
            clientId,
            redirectUri,
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL
        };
        authSessions.set(sessionId, session);

        console.log(`Created auth session: ${sessionId}`);

        // Build authorization URL
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: 'profile',
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        if (platformUrl) {
            params.append('platform_url', platformUrl);
        }

        const authorizationUrl = `${bridgeUrl}/authorize?${params.toString()}`;

        const output = {
            authorizationUrl,
            sessionId,
            instructions: 'Please visit the authorization URL in your browser to complete authentication. Once you\'ve logged in, let me know and I\'ll check the authentication status so that we are all set to work with your IntelligenceBank account!'
        };

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(output, null, 2)
            }],
            structuredContent: output
        };
    }
);

server.registerTool(
    'auth_status',
    {
        title: 'Authentication Status',
        description: 'Check authentication status for a session. Returns pending, completed, or error status along with tokens and user info when authentication is complete.',
        inputSchema: {
            sessionId: z.string().describe('Session ID from auth_login')
        },
        outputSchema: {
            status: z.enum(['pending', 'completed', 'error']),
            authenticated: z.boolean(),
            tokens: z.object({
                accessToken: z.string(),
                refreshToken: z.string(),
                tokenType: z.string(),
                expiresIn: z.number()
            }).optional(),
            userInfo: z.any().optional(),
            error: z.string().optional(),
            errorDescription: z.string().optional()
        }
    },
    async ({ sessionId }) => {
        const session = authSessions.get(sessionId);

        if (!session) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: 'error',
                        authenticated: false,
                        error: 'invalid_session',
                        errorDescription: 'Session not found or expired. Please start a new authentication flow.'
                    }, null, 2)
                }],
                structuredContent: {
                    status: 'error',
                    authenticated: false,
                    error: 'invalid_session',
                    errorDescription: 'Session not found or expired. Please start a new authentication flow.'
                }
            };
        }

        const output: any = {
            status: session.status,
            authenticated: session.status === 'completed'
        };

        if (session.status === 'completed' && session.tokens) {
            output.tokens = session.tokens;
            output.userInfo = session.userInfo;
        } else if (session.status === 'error') {
            output.error = session.error;
            output.errorDescription = session.errorDescription;
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(output, null, 2)
            }],
            structuredContent: output
        };
    }
);

// Token refresh helper function
async function refreshAccessToken(sessionId: string): Promise<boolean> {
    const session = authSessions.get(sessionId);
    if (!session || !session.tokens?.refreshToken) {
        return false;
    }

    const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';
    
    try {
        console.log(`Refreshing access token for session: ${sessionId}`);
        const response = await fetch(`${bridgeUrl}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: session.tokens.refreshToken,
                client_id: session.clientId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Token refresh failed:', error);
            
            // Check if session has expired or refresh limit exceeded
            if (error.error === 'invalid_token' &&
                (error.error_description?.includes('Session has expired') ||
                 error.error_description?.includes('Session refresh limit exceeded'))) {
                // Mark session as expired - user needs to re-authenticate
                session.status = 'error';
                session.error = 'session_expired';
                session.errorDescription = error.error_description;
                return false;
            }
            
            return false;
        }

        const tokens = await response.json();
        
        // Update session with new tokens
        session.tokens = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || session.tokens.refreshToken,
            tokenType: tokens.token_type,
            expiresIn: tokens.expires_in
        };
        
        console.log(`Access token refreshed successfully for session: ${sessionId}`);
        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

server.registerTool(
    'api_call',
    {
        title: 'Make Authenticated API Call',
        description: 'Make an authenticated API call to IntelligenceBank with automatic token refresh. Handles 401 errors by refreshing the access token automatically.',
        inputSchema: {
            sessionId: z.string().describe('Session ID from auth_login'),
            method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP method'),
            path: z.string().describe('API path (e.g., /company.intelligencebank.com/api/3.0.0/12345/users)'),
            body: z.any().optional().describe('Request body for POST/PUT/PATCH requests'),
            headers: z.record(z.string()).optional().describe('Additional headers')
        },
        outputSchema: {
            success: z.boolean(),
            status: z.number(),
            data: z.any().optional(),
            error: z.string().optional()
        }
    },
    async ({ sessionId, method, path, body, headers }) => {
        const session = authSessions.get(sessionId);

        if (!session) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: 'Session not found or expired. Please authenticate again using auth_login.'
                    }, null, 2)
                }],
                structuredContent: {
                    success: false,
                    error: 'Session not found or expired. Please authenticate again using auth_login.'
                }
            };
        }

        if (session.status !== 'completed' || !session.tokens) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: 'Session is not authenticated. Please complete authentication first.'
                    }, null, 2)
                }],
                structuredContent: {
                    success: false,
                    error: 'Session is not authenticated. Please complete authentication first.'
                }
            };
        }

        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';
        const apiUrl = `${bridgeUrl}/proxy${path.startsWith('/') ? path : '/' + path}`;

        // Make API call with retry on 401
        let retryCount = 0;
        const maxRetries = 1;

        while (retryCount <= maxRetries) {
            try {
                const requestHeaders: Record<string, string> = {
                    'Authorization': `Bearer ${session.tokens.accessToken}`,
                    ...headers
                };

                if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                    requestHeaders['Content-Type'] = 'application/json';
                }

                const response = await fetch(apiUrl, {
                    method,
                    headers: requestHeaders,
                    body: body ? JSON.stringify(body) : undefined
                });

                // Handle 401 - try to refresh token
                if (response.status === 401 && retryCount < maxRetries) {
                    console.log('Received 401, attempting token refresh...');
                    const refreshed = await refreshAccessToken(sessionId);
                    
                    if (refreshed) {
                        retryCount++;
                        continue; // Retry the request with new token
                    } else {
                        // Refresh failed - check if session expired
                        const updatedSession = authSessions.get(sessionId);
                        if (updatedSession?.status === 'error' && updatedSession.error === 'session_expired') {
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify({
                                        success: false,
                                        status: 401,
                                        error: 'session_expired',
                                        message: 'Your session has expired. Please authenticate again using auth_login.'
                                    }, null, 2)
                                }],
                                structuredContent: {
                                    success: false,
                                    status: 401,
                                    error: 'session_expired',
                                    message: 'Your session has expired. Please authenticate again using auth_login.'
                                }
                            };
                        }
                        
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    status: 401,
                                    error: 'authentication_failed',
                                    message: 'Token refresh failed. Please authenticate again using auth_login.'
                                }, null, 2)
                            }],
                            structuredContent: {
                                success: false,
                                status: 401,
                                error: 'authentication_failed',
                                message: 'Token refresh failed. Please authenticate again using auth_login.'
                            }
                        };
                    }
                }

                // Parse response
                const contentType = response.headers.get('content-type');
                let data;
                if (contentType?.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }

                const output = {
                    success: response.ok,
                    status: response.status,
                    data
                };

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(output, null, 2)
                    }],
                    structuredContent: output
                };

            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error occurred'
                        }, null, 2)
                    }],
                    structuredContent: {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error occurred'
                    }
                };
            }
        }

        // Should not reach here, but just in case
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: 'Max retries exceeded'
                }, null, 2)
            }],
            structuredContent: {
                success: false,
                error: 'Max retries exceeded'
            }
        };
    }
);


// ============================================================================
// MCP Endpoint
// ============================================================================

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
// Helper Functions
// ============================================================================

function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}