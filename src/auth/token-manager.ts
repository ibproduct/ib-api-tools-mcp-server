/**
 * Token Manager - handles OAuth token refresh operations
 *
 * IMPORTANT: OAuth token refresh is maintained ONLY for MCP protocol compliance.
 * The MCP client (e.g., Claude Desktop) may validate OAuth tokens across sessions.
 *
 * NOTE: Refreshing OAuth tokens does NOT extend the IntelligenceBank session.
 * The OAuth bridge returns the SAME sid on refresh, not a new one.
 * When the IB session expires (based on logintimeoutperiod), full re-authentication
 * is required via the auth_login tool.
 */

import { SessionManager } from '../session/SessionManager.js';

export class TokenManager {
    constructor(private sessionManager: SessionManager) {}

    /**
     * Refresh OAuth access token for MCP protocol compliance.
     * This does NOT extend the IntelligenceBank session validity.
     *
     * @param sessionId - The session ID to refresh tokens for
     * @returns true if refresh succeeded, false otherwise
     */
    async refreshAccessToken(sessionId: string): Promise<boolean> {
        const session = this.sessionManager.getSession(sessionId);
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
                    this.sessionManager.updateSession(sessionId, {
                        status: 'error',
                        error: 'session_expired',
                        errorDescription: error.error_description
                    });
                    return false;
                }
                
                return false;
            }

            const tokens = await response.json();
            
            // Update session with new OAuth tokens
            // Note: The OAuth bridge returns the SAME sid, not a new one
            const sessionUpdate: any = {
                tokens: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || session.tokens.refreshToken,
                    tokenType: tokens.token_type,
                    expiresIn: tokens.expires_in
                }
            };
            
            // The OAuth bridge returns the same IB session data on refresh
            // This does NOT extend the IB session validity
            if (tokens.sid) {
                // Note: This is the SAME sid as before, not a new session
                sessionUpdate.ibSession = {
                    sid: tokens.sid,  // Same sid
                    clientId: session.ibSession?.clientId || tokens.clientid,
                    apiV3url: session.ibSession?.apiV3url || tokens.apiV3url,
                    logintimeoutperiod: session.ibSession?.logintimeoutperiod,
                    sidExpiry: tokens.sidExpiry,  // Original expiry, not extended
                    sidCreatedAt: tokens.sidCreatedAt
                };
                console.log('OAuth tokens refreshed (IB session remains the same)');
            }
            
            this.sessionManager.updateSession(sessionId, sessionUpdate);
            
            console.log(`Access token refreshed successfully for session: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }
}