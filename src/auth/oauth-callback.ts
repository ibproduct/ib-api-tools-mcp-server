/**
 * OAuth Callback Handler
 * Extracted from index.ts lines 84-191
 * No logic changes - just moved to separate module
 */

import { Request, Response } from 'express';
import { SessionManager } from '../session/SessionManager.js';
import { generateSuccessPage, generateErrorPage } from './html-pages.js';

export class OAuthCallbackHandler {
    constructor(private sessionManager: SessionManager) {}

    async handleCallback(req: Request, res: Response): Promise<void> {
        // Same logic as lines 84-191 in index.ts
        const { code, state, error, error_description } = req.query;

        console.log('OAuth callback received:', { code: code ? 'present' : 'missing', state, error });

        // Handle OAuth errors
        if (error) {
            const session = state ? this.sessionManager.findSessionByState(state as string) : undefined;
            if (session) {
                this.sessionManager.updateSession(session.sessionId, {
                    status: 'error',
                    error: error as string,
                    errorDescription: error_description as string
                });
            }

            res.send(generateErrorPage(error as string, error_description as string));
            return;
        }

        // Validate required parameters
        if (!code || !state) {
            res.status(400).send(generateErrorPage(
                'invalid_request',
                'Missing required parameters: code and state'
            ));
            return;
        }

        // Find session by state
        const session = this.sessionManager.findSessionByState(state as string);
        if (!session) {
            res.status(400).send(generateErrorPage(
                'invalid_state',
                'Invalid or expired authentication session. Please try again.'
            ));
            return;
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
                
                this.sessionManager.updateSession(session.sessionId, {
                    status: 'error',
                    error: errorData.error || 'token_exchange_failed',
                    errorDescription: errorData.error_description || 'Failed to exchange authorization code for tokens'
                });
                
                res.send(generateErrorPage(
                    errorData.error || 'token_exchange_failed', 
                    errorData.error_description || 'Failed to exchange authorization code for tokens'
                ));
                return;
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
            this.sessionManager.updateSession(session.sessionId, {
                status: 'completed',
                tokens: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    tokenType: tokens.token_type,
                    expiresIn: tokens.expires_in
                },
                userInfo: userInfo
            });

            console.log(`Authentication completed for session: ${session.sessionId}`);

            // Return success page
            res.send(generateSuccessPage(userInfo));

        } catch (error) {
            console.error('Error during token exchange:', error);
            
            this.sessionManager.updateSession(session.sessionId, {
                status: 'error',
                error: 'server_error',
                errorDescription: error instanceof Error ? error.message : 'An unexpected error occurred'
            });
            
            res.send(generateErrorPage(
                'server_error',
                error instanceof Error ? error.message : 'An unexpected error occurred'
            ));
        }
    }
}