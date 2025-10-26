/**
 * Browser Login Tools
 * Direct browser-based authentication using IntelligenceBank's native browser login API
 * Simpler alternative to OAuth flow - bypasses OAuth bridge entirely
 *
 * Provides two separate tools:
 * - BrowserLoginStartTool: Initiates browser login
 * - BrowserLoginCompleteTool: Completes browser login
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';

/**
 * Browser Login Start Tool
 * Initiates the browser-based authentication flow
 */
export class BrowserLoginStartTool {
    public readonly definition = {
        name: 'browser_login_start',
        title: 'Start Browser Login',
        description: 'Initiate direct browser-based authentication with IntelligenceBank. Returns a URL for the user to visit in their browser to log in. This is a simpler alternative to OAuth authentication.',
        inputSchema: {
            platformUrl: z.string().describe('Your IntelligenceBank platform URL (e.g., https://company.intelligencebank.com)')
        },
        outputSchema: {
            sessionId: z.string(),
            browserUrl: z.string(),
            instructions: z.string()
        }
    };

    constructor(private sessionManager: SessionManager) {}

    async execute({ platformUrl }: { platformUrl: string }) {
        console.log(`Starting browser login for platform: ${platformUrl}`);

        // Normalize platform URL (remove trailing slash, ensure https)
        const normalizedUrl = platformUrl.replace(/\/$/, '');
        const httpsUrl = normalizedUrl.startsWith('http') ? normalizedUrl : `https://${normalizedUrl}`;

        try {
            // Step 1: Call /v1/auth/app/token to initiate browser login
            console.log(`Calling ${httpsUrl}/v1/auth/app/token`);
            const tokenResponse = await fetch(`${httpsUrl}/v1/auth/app/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                console.error('Token initiation failed:', errorText);
                
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: 'token_initiation_failed',
                            message: `Failed to initiate browser login: ${tokenResponse.status} ${tokenResponse.statusText}`,
                            details: errorText
                        }, null, 2)
                    }],
                    structuredContent: {
                        error: 'token_initiation_failed',
                        message: `Failed to initiate browser login: ${tokenResponse.status} ${tokenResponse.statusText}`,
                        details: errorText
                    }
                };
            }

            const tokenData = await tokenResponse.json();
            console.log('Token response received:', {
                hasSID: !!tokenData.SID,
                hasContent: !!tokenData.content
            });

            if (!tokenData.SID || !tokenData.content) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: 'invalid_response',
                            message: 'Invalid response from platform - missing SID or content fields'
                        }, null, 2)
                    }],
                    structuredContent: {
                        error: 'invalid_response',
                        message: 'Invalid response from platform - missing SID or content fields'
                    }
                };
            }

            // Create session with browser login data
            const session = this.sessionManager.createSession({
                codeVerifier: '', // Not used for browser login
                state: '',        // Not used for browser login
                clientId: '',     // Not used for browser login
                redirectUri: ''   // Not used for browser login
            });

            // Update session with browser login specific data
            this.sessionManager.updateSession(session.sessionId, {
                status: 'browser_pending',
                platformUrl: httpsUrl,
                browserToken: tokenData.content,
                browserSID: tokenData.SID
            });

            // Step 2: Construct browser URL
            const browserUrl = `${httpsUrl}/auth/?login=0&token=${tokenData.content}`;

            const output = {
                sessionId: session.sessionId,
                browserUrl,
                instructions: 'Please visit the browser URL above and complete the login process in your IntelligenceBank account. Once you\'ve successfully logged in, let me know and I\'ll complete the authentication by calling browser_login_complete.'
            };

            console.log(`Browser login session created: ${session.sessionId}`);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(output, null, 2)
                }],
                structuredContent: output
            };

        } catch (error) {
            console.error('Error during browser login start:', error);
            
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: 'server_error',
                        message: error instanceof Error ? error.message : 'An unexpected error occurred'
                    }, null, 2)
                }],
                structuredContent: {
                    error: 'server_error',
                    message: error instanceof Error ? error.message : 'An unexpected error occurred'
                }
            };
        }
    }

}

/**
 * Browser Login Complete Tool
 * Completes the browser-based authentication flow
 */
export class BrowserLoginCompleteTool {
    public readonly definition = {
        name: 'browser_login_complete',
        title: 'Complete Browser Login',
        description: 'Complete the browser-based authentication after the user has logged in through their browser. Retrieves and stores the IntelligenceBank session credentials.',
        inputSchema: {
            sessionId: z.string().describe('Session ID from browser_login_start')
        },
        outputSchema: {
            status: z.enum(['completed', 'error']),
            authenticated: z.boolean(),
            userInfo: z.any().optional(),
            sessionExpiry: z.string().optional(),
            error: z.string().optional(),
            errorDescription: z.string().optional()
        }
    };

    constructor(private sessionManager: SessionManager) {}

    async execute({ sessionId }: { sessionId: string }) {
        console.log(`Completing browser login for session: ${sessionId}`);

        // Retrieve session
        const session = this.sessionManager.getSession(sessionId);

        if (!session) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: 'error',
                        authenticated: false,
                        error: 'invalid_session',
                        errorDescription: 'Session not found or expired. Please start a new browser login flow.'
                    }, null, 2)
                }],
                structuredContent: {
                    status: 'error' as const,
                    authenticated: false,
                    error: 'invalid_session',
                    errorDescription: 'Session not found or expired. Please start a new browser login flow.'
                }
            };
        }

        if (session.status !== 'browser_pending') {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: 'error',
                        authenticated: false,
                        error: 'invalid_status',
                        errorDescription: `Session status is ${session.status}. Expected browser_pending. Please use browser_login_start first.`
                    }, null, 2)
                }],
                structuredContent: {
                    status: 'error' as const,
                    authenticated: false,
                    error: 'invalid_status',
                    errorDescription: `Session status is ${session.status}. Expected browser_pending. Please use browser_login_start first.`
                }
            };
        }

        if (!session.platformUrl || !session.browserToken) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: 'error',
                        authenticated: false,
                        error: 'invalid_session_data',
                        errorDescription: 'Session is missing browser login data. Please start a new browser login flow.'
                    }, null, 2)
                }],
                structuredContent: {
                    status: 'error' as const,
                    authenticated: false,
                    error: 'invalid_session_data',
                    errorDescription: 'Session is missing browser login data. Please start a new browser login flow.'
                }
            };
        }

        try {
            // Step 3: Call /v1/auth/app/info to retrieve session credentials
            const infoUrl = `${session.platformUrl}/v1/auth/app/info?token=${session.browserToken}`;
            console.log(`Fetching session info from: ${infoUrl}`);
            
            const infoResponse = await fetch(infoUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!infoResponse.ok) {
                const errorText = await infoResponse.text();
                console.error('Session info retrieval failed:', errorText);
                
                this.sessionManager.updateSession(sessionId, {
                    status: 'error',
                    error: 'info_retrieval_failed',
                    errorDescription: `Failed to retrieve session info: ${infoResponse.status} ${infoResponse.statusText}`
                });
                
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            authenticated: false,
                            error: 'info_retrieval_failed',
                            errorDescription: `Failed to retrieve session info. This usually means the user hasn't completed login yet, or the login session has expired. Please try logging in again.`,
                            details: errorText
                        }, null, 2)
                    }],
                    structuredContent: {
                        status: 'error' as const,
                        authenticated: false,
                        error: 'info_retrieval_failed',
                        errorDescription: `Failed to retrieve session info. This usually means the user hasn't completed login yet, or the login session has expired. Please try logging in again.`,
                        details: errorText
                    }
                };
            }

            const infoData = await infoResponse.json();
            console.log('Session info retrieved:', {
                hasSID: !!infoData.SID,
                hasContent: !!infoData.content,
                hasSession: !!infoData.content?.session,
                hasInfo: !!infoData.content?.info
            });

            // Extract session credentials
            const sessionData = infoData.content?.session;
            const userInfoData = infoData.content?.info;

            if (!sessionData || !userInfoData) {
                this.sessionManager.updateSession(sessionId, {
                    status: 'error',
                    error: 'invalid_response',
                    errorDescription: 'Invalid response structure from platform'
                });
                
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            authenticated: false,
                            error: 'invalid_response',
                            errorDescription: 'Invalid response structure from platform - missing session or info data'
                        }, null, 2)
                    }],
                    structuredContent: {
                        status: 'error' as const,
                        authenticated: false,
                        error: 'invalid_response',
                        errorDescription: 'Invalid response structure from platform - missing session or info data'
                    }
                };
            }

            // Extract required fields
            const sid = sessionData.sid || userInfoData.sid;
            const clientId = userInfoData.clientid;
            const apiV3url = userInfoData.apiV3url;
            const logintimeoutperiod = userInfoData.logintimeoutperiod;

            if (!sid || !clientId || !apiV3url) {
                this.sessionManager.updateSession(sessionId, {
                    status: 'error',
                    error: 'missing_credentials',
                    errorDescription: 'Response is missing required credentials (sid, clientid, or apiV3url)'
                });
                
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            authenticated: false,
                            error: 'missing_credentials',
                            errorDescription: 'Response is missing required credentials (sid, clientid, or apiV3url)'
                        }, null, 2)
                    }],
                    structuredContent: {
                        status: 'error' as const,
                        authenticated: false,
                        error: 'missing_credentials',
                        errorDescription: 'Response is missing required credentials (sid, clientid, or apiV3url)'
                    }
                };
            }

            // Calculate session expiry
            const sidCreatedAt = sessionData.loginTime || Math.floor(Date.now() / 1000);
            const sidExpiry = logintimeoutperiod 
                ? sidCreatedAt + (logintimeoutperiod * 3600) 
                : undefined;

            // Update session with IB credentials
            this.sessionManager.updateSession(sessionId, {
                status: 'completed',
                ibSession: {
                    sid,
                    clientId,
                    apiV3url,
                    logintimeoutperiod,
                    sidExpiry,
                    sidCreatedAt
                },
                userInfo: {
                    firstName: userInfoData.firstname,
                    lastName: userInfoData.lastname,
                    email: userInfoData.adminemail,
                    clientName: userInfoData.clientname,
                    userUuid: sessionData.userUuid
                }
            });

            console.log(`Browser login completed for session: ${sessionId}`, {
                sid: sid.substring(0, 8) + '...',
                clientId,
                apiV3url
            });

            const output: any = {
                status: 'completed',
                authenticated: true,
                userInfo: {
                    firstName: userInfoData.firstname,
                    lastName: userInfoData.lastname,
                    email: userInfoData.adminemail,
                    clientName: userInfoData.clientname
                }
            };

            if (sidExpiry) {
                output.sessionExpiry = new Date(sidExpiry * 1000).toISOString();
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(output, null, 2)
                }],
                structuredContent: output
            };

        } catch (error) {
            console.error('Error during browser login complete:', error);
            
            this.sessionManager.updateSession(sessionId, {
                status: 'error',
                error: 'server_error',
                errorDescription: error instanceof Error ? error.message : 'An unexpected error occurred'
            });
            
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: 'error',
                        authenticated: false,
                        error: 'server_error',
                        errorDescription: error instanceof Error ? error.message : 'An unexpected error occurred'
                    }, null, 2)
                }],
                structuredContent: {
                    status: 'error' as const,
                    authenticated: false,
                    error: 'server_error',
                    errorDescription: error instanceof Error ? error.message : 'An unexpected error occurred'
                }
            };
        }
    }
}