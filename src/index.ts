#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// Create Express app
const app = express();
app.use(express.json());

// Configure CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id']
}));

// Create MCP server
const server = new McpServer({
    name: 'IntelligenceBank API Tools',
    version: '0.1.0'
});

// Register authentication tools
server.registerTool(
    'auth_login',
    {
        title: 'OAuth Login',
        description: 'Start OAuth 2.0 login flow with IntelligenceBank',
        inputSchema: {
            platformUrl: z.string().optional().describe('IntelligenceBank platform URL (e.g., https://company.intelligencebank.com)')
        },
        outputSchema: {
            authorizationUrl: z.string(),
            state: z.string(),
            codeVerifier: z.string()
        }
    },
    async ({ platformUrl }) => {
        // Generate PKCE parameters
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateState();

        const clientId = process.env.OAUTH_CLIENT_ID || 'ib-api-tools-mcp-server';
        const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

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
            state,
            codeVerifier
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
    'auth_exchange',
    {
        title: 'Exchange Authorization Code',
        description: 'Exchange authorization code for access tokens',
        inputSchema: {
            code: z.string().describe('Authorization code from OAuth callback'),
            codeVerifier: z.string().describe('PKCE code verifier from login'),
            state: z.string().optional().describe('State parameter for validation')
        },
        outputSchema: {
            accessToken: z.string(),
            tokenType: z.string(),
            expiresIn: z.number(),
            refreshToken: z.string().optional()
        }
    },
    async ({ code, codeVerifier }) => {
        const clientId = process.env.OAUTH_CLIENT_ID || 'ib-api-tools-mcp-server';
        const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

        try {
            const response = await fetch(`${bridgeUrl}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri,
                    client_id: clientId,
                    code_verifier: codeVerifier
                })
            });

            if (!response.ok) {
                const error = await response.json();
                return {
                    content: [{
                        type: 'text',
                        text: `Token exchange failed: ${error.error_description || error.error}`
                    }],
                    isError: true
                };
            }

            const tokens = await response.json();
            const output = {
                accessToken: tokens.access_token,
                tokenType: tokens.token_type,
                expiresIn: tokens.expires_in,
                refreshToken: tokens.refresh_token
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
                    text: `Error exchanging code: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

server.registerTool(
    'auth_status',
    {
        title: 'Authentication Status',
        description: 'Check current authentication status and user information',
        inputSchema: {
            accessToken: z.string().describe('Access token to validate')
        },
        outputSchema: {
            authenticated: z.boolean(),
            userInfo: z.object({
                sub: z.string(),
                name: z.string().optional(),
                email: z.string().optional(),
                ib_client_id: z.string().optional(),
                ib_api_url: z.string().optional()
            }).optional()
        }
    },
    async ({ accessToken }) => {
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

        try {
            const response = await fetch(`${bridgeUrl}/userinfo`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({ authenticated: false })
                    }],
                    structuredContent: { authenticated: false }
                };
            }

            const userInfo = await response.json();
            const output = {
                authenticated: true,
                userInfo
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
                    text: `Error checking status: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// MCP endpoint - POST for requests, GET for notifications
app.post('/mcp', async (req, res) => {
    try {
        // Create new transport for each request (stateless mode)
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

// Start server
const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
    console.log(`IntelligenceBank API Tools MCP Server running on http://localhost:${port}/mcp`);
    console.log('Available tools:');
    console.log('  - auth_login: Start OAuth 2.0 login flow');
    console.log('  - auth_exchange: Exchange authorization code for tokens');
    console.log('  - auth_status: Check authentication status');
}).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

// Helper functions
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