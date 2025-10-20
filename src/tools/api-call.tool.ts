/**
 * API Call Tool
 * Simplified to use only direct IntelligenceBank API calls with sid
 * OAuth tokens are used only for MCP protocol compliance
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';

export class ApiCallTool {
    public readonly definition = {
        name: 'api_call',
        title: 'Make Authenticated API Call',
        description: 'Make an authenticated API call to IntelligenceBank using the session ID (sid) obtained during authentication. All API calls are made directly to the IntelligenceBank API.',
        inputSchema: {
            sessionId: z.string().describe('Session ID from auth_login'),
            method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP method'),
            path: z.string().describe('API path (e.g., /api/3.0.0/12345/users) or full URL (e.g., company.intelligencebank.com/api/3.0.0/12345/users)'),
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

    constructor(private sessionManager: SessionManager) {}

    async execute({ sessionId, method, path, body, headers }: {
        sessionId: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
        path: string;
        body?: any;
        headers?: Record<string, string>;
    }) {
        // Validate session exists
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

        if (session.status !== 'completed' || !session.ibSession) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: 'IntelligenceBank session not available. Please complete authentication first.'
                    }, null, 2)
                }],
                structuredContent: {
                    success: false,
                    error: 'IntelligenceBank session not available. Please complete authentication first.'
                }
            };
        }

        // Construct API URL
        let apiUrl: string;
        
        // Check if path already includes domain
        if (path.includes('intelligencebank.com')) {
            // Full URL provided - ensure https
            apiUrl = path.startsWith('http') ? path : `https://${path}`;
        } else {
            // Path only - construct full URL from session data
            const baseUrl = session.ibSession.apiV3url.replace(/\/api\/v3\/?$/, ''); // Remove /api/v3 suffix if present
            apiUrl = `https://${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
        }
        
        console.log(`Making direct API call to: ${apiUrl}`);

        // Set request headers with sid
        const requestHeaders: Record<string, string> = {
            'sid': session.ibSession.sid,
            'Accept': 'application/json',
            ...headers
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestHeaders['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(apiUrl, {
                method,
                headers: requestHeaders,
                body: body ? JSON.stringify(body) : undefined
            });

            // Handle 401 - session expired
            if (response.status === 401) {
                console.log('Received 401 - IntelligenceBank session expired');
                
                // Mark session as expired
                this.sessionManager.updateSession(sessionId, {
                    status: 'error',
                    error: 'session_expired',
                    errorDescription: 'IntelligenceBank session has expired'
                });
                
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            status: 401,
                            error: 'session_expired',
                            message: 'Your IntelligenceBank session has expired. Please authenticate again using auth_login.'
                        }, null, 2)
                    }],
                    structuredContent: {
                        success: false,
                        status: 401,
                        error: 'session_expired',
                        message: 'Your IntelligenceBank session has expired. Please authenticate again using auth_login.'
                    }
                };
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
}