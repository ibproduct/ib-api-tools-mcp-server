/**
 * Auth Login Tool
 * Extracted from index.ts lines 448-519
 * No logic changes - just moved to separate module
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../auth/oauth-utils.js';

export class AuthLoginTool {
    public readonly definition = {
        name: 'auth_login',
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
    };

    constructor(private sessionManager: SessionManager) {}

    async execute({ platformUrl }: { platformUrl?: string }) {
        // Same logic as lines 462-517 in index.ts
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateState();

        const clientId = process.env.OAUTH_CLIENT_ID || 'ib-api-tools-mcp-server';
        const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

        // Create session
        const session = this.sessionManager.createSession({
            codeVerifier,
            state,
            clientId,
            redirectUri
        });

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
            sessionId: session.sessionId,
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
}