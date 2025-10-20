/**
 * API Call Tool
 * Extracted from index.ts lines 648-832
 * No logic changes - just moved to separate module
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';
import { TokenManager } from '../auth/token-manager.js';

export class ApiCallTool {
    public readonly definition = {
        name: 'api_call',
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
    };

    private tokenManager: TokenManager;

    constructor(private sessionManager: SessionManager) {
        this.tokenManager = new TokenManager(sessionManager);
    }

    async execute({ sessionId, method, path, body, headers }: {
        sessionId: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
        path: string;
        body?: any;
        headers?: Record<string, string>;
    }) {
        // Same logic as lines 667-831 in index.ts
        const session = this.sessionManager.getSession(sessionId);

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
                    const refreshed = await this.tokenManager.refreshAccessToken(sessionId);
                    
                    if (refreshed) {
                        retryCount++;
                        // Refresh the session reference to get updated tokens
                        const updatedSession = this.sessionManager.getSession(sessionId);
                        if (updatedSession?.tokens) {
                            session.tokens = updatedSession.tokens;
                        }
                        continue; // Retry the request with new token
                    } else {
                        // Refresh failed - check if session expired
                        const updatedSession = this.sessionManager.getSession(sessionId);
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
}