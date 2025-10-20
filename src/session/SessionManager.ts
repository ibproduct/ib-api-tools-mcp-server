/**
 * Session Manager
 * Extracted from index.ts lines 33-64
 * No logic changes - just moved into a class structure
 */

import { AuthSession } from '../types/session.types.js';

export class SessionManager {
    private authSessions = new Map<string, AuthSession>();
    private SESSION_TTL = 5 * 60 * 1000; // 5 minutes
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Start cleanup interval - same logic as lines 38-46 in index.ts
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [sessionId, session] of this.authSessions.entries()) {
                if (session.expiresAt < now) {
                    this.authSessions.delete(sessionId);
                    console.log(`Cleaned up expired session: ${sessionId}`);
                }
            }
        }, 60 * 1000);
    }

    generateSessionId(): string {
        // Same logic as lines 48-54 in index.ts
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    findSessionByState(state: string): AuthSession | undefined {
        // Same logic as lines 57-64 in index.ts
        for (const session of this.authSessions.values()) {
            if (session.state === state) {
                return session;
            }
        }
        return undefined;
    }

    createSession(params: {
        codeVerifier: string;
        state: string;
        clientId: string;
        redirectUri: string;
    }): AuthSession {
        const sessionId = this.generateSessionId();
        const session: AuthSession = {
            sessionId,
            codeVerifier: params.codeVerifier,
            state: params.state,
            clientId: params.clientId,
            redirectUri: params.redirectUri,
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + this.SESSION_TTL
        };
        this.authSessions.set(sessionId, session);
        console.log(`Created auth session: ${sessionId}`);
        return session;
    }

    getSession(sessionId: string): AuthSession | undefined {
        return this.authSessions.get(sessionId);
    }

    updateSession(sessionId: string, updates: Partial<AuthSession>): void {
        const session = this.authSessions.get(sessionId);
        if (session) {
            Object.assign(session, updates);
        }
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.authSessions.clear();
    }
}