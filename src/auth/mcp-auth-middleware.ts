/**
 * MCP Authentication Middleware
 *
 * Intercepts MCP resource requests and returns HTTP 401 with WWW-Authenticate
 * header when authentication is required, as per MCP Authorization specification.
 */

import { Request, Response, NextFunction } from 'express';
import { SessionManager } from '../session/SessionManager.js';
import { extractBearerToken, buildWWWAuthenticateHeader } from './mcp-authorization.js';
import type { AuthSession } from '../types/session.types.js';

/**
 * Find authenticated session by Bearer token
 */
function findAuthenticatedSessionByToken(
    sessionManager: SessionManager,
    authHeader: string | undefined
): AuthSession | null {
    const token = extractBearerToken(authHeader);
    if (!token) {
        return null;
    }
    
    const allSessions = (sessionManager as any).authSessions as Map<string, AuthSession>;
    
    for (const session of allSessions.values()) {
        if (session.tokens?.accessToken === token &&
            session.status === 'completed' &&
            session.ibSession?.sid) {
            const now = Date.now();
            if (!session.ibSession.sidExpiry || session.ibSession.sidExpiry > now) {
                return session;
            }
        }
    }
    
    return null;
}

/**
 * Fetch IB session data from OAuth bridge /userinfo endpoint
 * This is used when MCP clients (like Inspector or Claude Desktop) complete
 * OAuth flow themselves and we don't have the IB session data
 */
async function fetchIBSessionFromUserInfo(accessToken: string): Promise<any | null> {
    try {
        const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';
        const response = await fetch(`${bridgeUrl}/userinfo`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            console.error('Failed to fetch userinfo:', response.status);
            return null;
        }
        
        const userInfo = await response.json();
        
        // Extract IB session data from userinfo response
        if (userInfo.ib_session_id && userInfo.ib_client_id && userInfo.ib_api_url) {
            return {
                sid: userInfo.ib_session_id,
                clientId: userInfo.ib_client_id,
                apiV3url: userInfo.ib_api_url,
                userInfo: {
                    firstName: userInfo.given_name,
                    lastName: userInfo.family_name,
                    email: userInfo.email,
                    userUuid: userInfo.ib_user_uuid
                }
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching userinfo:', error);
        return null;
    }
}

/**
 * Find or create session from Bearer token
 * If session doesn't exist, fetch IB data from /userinfo and create one
 */
export async function findOrCreateSessionFromToken(
    sessionManager: SessionManager,
    authHeader: string | undefined
): Promise<AuthSession | null> {
    console.log('[findOrCreateSessionFromToken] Starting session lookup/creation');
    
    // First try to find existing session
    const existingSession = findAuthenticatedSessionByToken(sessionManager, authHeader);
    if (existingSession) {
        console.log('[findOrCreateSessionFromToken] Found existing session:', existingSession.sessionId);
        return existingSession;
    }
    
    // No existing session - fetch IB data from /userinfo
    const token = extractBearerToken(authHeader);
    if (!token) {
        console.log('[findOrCreateSessionFromToken] No Bearer token found');
        return null;
    }
    
    console.log('[findOrCreateSessionFromToken] No existing session, fetching from /userinfo...', {
        tokenPreview: token.substring(0, 20) + '...'
    });
    const ibData = await fetchIBSessionFromUserInfo(token);
    
    if (!ibData) {
        console.error('[findOrCreateSessionFromToken] Failed to fetch IB session data from /userinfo');
        return null;
    }
    
    // Create new session with IB data
    const session = sessionManager.createSession({
        codeVerifier: '',
        state: '',
        clientId: 'mcp-public-client',
        redirectUri: ''
    });
    
    sessionManager.updateSession(session.sessionId, {
        status: 'completed',
        tokens: {
            accessToken: token,
            refreshToken: '', // We don't have this from the token alone
            tokenType: 'Bearer',
            expiresIn: 3600
        },
        ibSession: {
            sid: ibData.sid,
            clientId: ibData.clientId,
            apiV3url: ibData.apiV3url,
            logintimeoutperiod: undefined,
            sidExpiry: undefined,
            sidCreatedAt: Math.floor(Date.now() / 1000)
        },
        userInfo: ibData.userInfo
    });
    
    console.log('[findOrCreateSessionFromToken] Created new session from Bearer token:', {
        sessionId: session.sessionId,
        sidPreview: ibData.sid.substring(0, 8) + '...',
        clientId: ibData.clientId,
        apiV3url: ibData.apiV3url
    });
    
    return sessionManager.getSession(session.sessionId) || null;
}

/**
 * Middleware to create sessions from Bearer tokens for resource requests
 * Ensures sessions exist before requests reach MCP handlers
 *
 * IMPORTANT: This middleware creates sessions and waits for completion
 */
export function mcpAuthMiddleware(sessionManager: SessionManager) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Only process MCP resource requests
        if (req.method === 'POST' && req.path === '/mcp' && req.body) {
            const method = req.body.method;
            
            console.log('[mcpAuthMiddleware] Processing request:', {
                method,
                hasAuth: !!req.headers.authorization
            });
            
            // For resource requests, ensure session exists for Bearer token
            if (method === 'resources/list' || method === 'resources/read' || method === 'resources/subscribe') {
                console.log('[mcpAuthMiddleware] Resource request detected, ensuring session exists');
                const authHeader = req.headers.authorization;
                if (authHeader) {
                    try {
                        // Create session from token if it doesn't exist
                        // WAIT for it to complete before continuing
                        const session = await findOrCreateSessionFromToken(sessionManager, authHeader);
                        console.log('[mcpAuthMiddleware] Session ready:', {
                            sessionId: session?.sessionId,
                            hasSid: !!session?.ibSession?.sid
                        });
                    } catch (err) {
                        console.error('[mcpAuthMiddleware] Error creating session from token:', err);
                    }
                } else {
                    console.log('[mcpAuthMiddleware] No Authorization header present for resource request');
                }
            }
        }
        
        next();
    };
}