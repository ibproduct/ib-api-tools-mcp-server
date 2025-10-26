/**
 * Session Types
 * Updated to support multiple authentication methods:
 * - OAuth tokens for MCP protocol compliance
 * - IntelligenceBank session credentials for direct API calls
 * - Browser-based direct authentication
 */

export interface AuthSession {
    sessionId: string;
    codeVerifier: string;
    state: string;
    clientId: string;
    redirectUri: string;
    status: 'pending' | 'completed' | 'error' | 'browser_pending';
    
    // OAuth-specific data
    tokens?: {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
    };
    
    // Browser login-specific data
    platformUrl?: string;      // IB platform URL for browser login
    browserToken?: string;     // Token from /v1/auth/app/token (content field)
    browserSID?: string;       // SID from /v1/auth/app/token
    
    // IntelligenceBank session data (from OAuth bridge OR browser login)
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