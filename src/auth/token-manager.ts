/**
 * Token Manager - handles token refresh operations
 * Extracted from index.ts lines 589-646
 * No logic changes - just moved to separate module
 */

import { SessionManager } from '../session/SessionManager.js';

export class TokenManager {
    constructor(private sessionManager: SessionManager) {}

    async refreshAccessToken(sessionId: string): Promise<boolean> {
        // Same logic as lines 590-646 in index.ts
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
            
            // Update session with new tokens
            this.sessionManager.updateSession(sessionId, {
                tokens: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || session.tokens.refreshToken,
                    tokenType: tokens.token_type,
                    expiresIn: tokens.expires_in
                }
            });
            
            console.log(`Access token refreshed successfully for session: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }
}