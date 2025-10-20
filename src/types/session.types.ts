/**
 * Session Types
 * Extracted from index.ts lines 13-31
 * No logic changes - pure type definitions
 */

export interface AuthSession {
    sessionId: string;
    codeVerifier: string;
    state: string;
    clientId: string;
    redirectUri: string;
    status: 'pending' | 'completed' | 'error';
    tokens?: {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
    };
    userInfo?: any;
    error?: string;
    errorDescription?: string;
    createdAt: number;
    expiresAt: number;
}