/**
 * Auth Status Tool
 * Extracted from index.ts lines 521-587
 * No logic changes - just moved to separate module
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';

export class AuthStatusTool {
    public readonly definition = {
        name: 'auth_status',
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
    };

    constructor(private sessionManager: SessionManager) {}

    async execute({ sessionId }: { sessionId: string }) {
        // Same logic as lines 543-586 in index.ts
        const session = this.sessionManager.getSession(sessionId);

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
                    status: 'error' as const,
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
}