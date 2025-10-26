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
        description: `AUTHENTICATION STEP 1 of 2: Initiate browser-based authentication with IntelligenceBank.

WHEN TO USE:
Call this tool when starting a new session or when user needs to authenticate.

WORKFLOW:
1. Call this tool with platformUrl → Get browserUrl and sessionId
2. User visits browserUrl and logs in via browser
3. Call browser_login_complete with sessionId → Get authenticated session
4. Use sessionId in subsequent API calls (upload_file, run_file_compliance_review, etc.)

RETURNS:
- sessionId: Use this in browser_login_complete (step 3) and all subsequent API calls
- browserUrl: User must visit this URL to log in
- instructions: What to tell the user`,
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
        description: `AUTHENTICATION STEP 2 of 2: Complete browser authentication after user logs in.

PREREQUISITE:
- User must have called browser_login_start and visited the browserUrl
- User must have completed login in their browser

WORKFLOW:
1. browser_login_start → Get browserUrl and sessionId
2. User visits browserUrl and logs in
3. Call this tool with sessionId (you are here) → Get authentication confirmation
4. Use same sessionId for all subsequent API calls

RETURNS:
- status: "completed" when successful
- authenticated: true/false
- userInfo: User details and client name
- sessionExpiry: When session expires (if available)

After successful completion, the sessionId from step 1 is now authenticated and can be used with:
- get_compliance_filters
- upload_file
- run_file_compliance_review`,
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