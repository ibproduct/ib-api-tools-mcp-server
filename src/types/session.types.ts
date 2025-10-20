/**
 * Session Types
 * Updated to support dual-authentication architecture:
 * - OAuth tokens for MCP protocol compliance
 * - IntelligenceBank session credentials for direct API calls
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
    // IntelligenceBank session data from OAuth bridge
    ibSession?: {
        sid: string;           // IB session ID for direct API calls
        clientId: string;      // IB client ID (not OAuth client ID)
        apiV3url: string;      // IB API base URL
        logintimeoutperiod?: number;  // Session validity in hours (1-120)
        sidExpiry?: number;    // Unix timestamp when session expires
        sidCreatedAt?: number; // Unix timestamp when session was created
    };
    userInfo?: any;
    error?: string;
    errorDescription?: string;
    createdAt: number;
    expiresAt: number;
}