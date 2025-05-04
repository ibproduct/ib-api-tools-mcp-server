import { z } from 'zod';

// Response types
export interface TokenResponse {
  content: string;
}

export interface SessionInfo {
  SID: string;
  content: {
    session: {
      sid: string;
      userUuid: string;
      loginTime: number;
    };
    info: {
      clientname: string;
      apikey: string;
      apiV3url: string;
      [key: string]: unknown;
    };
  };
}

interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

// Auth state
let currentToken: string | null = null;
let currentSession: SessionInfo | null = null;

// Poll interval and timeout
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

export const authTool = {
  name: "auth.login",
  description: "Start browser login flow",
  inputSchema: z.object({}),
  handler: async (): Promise<ToolResponse> => {
    try {
      // Step 1: Get initial token
      const tokenRes = await fetch(`${process.env.IB_API_URL}/v1/auth/app/token`);
      const { content: token } = await tokenRes.json() as TokenResponse;
      currentToken = token;

      // Step 2: Return login URL for browser
      const loginUrl = `${process.env.IB_API_URL}/auth/?login=0&token=${token}`;

      // Step 3: Start polling in background
      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        try {
          // Check if we've exceeded max poll time
          if (Date.now() - startTime > MAX_POLL_TIME) {
            clearInterval(pollInterval);
            currentToken = null;
            return;
          }

          // Poll for session info
          const infoRes = await fetch(`${process.env.IB_API_URL}/v1/auth/app/info?token=${token}`);
          
          if (infoRes.status === 404) {
            // User hasn't completed login yet
            return;
          }

          if (infoRes.status === 200) {
            // Login successful!
            clearInterval(pollInterval);
            const sessionInfo = await infoRes.json() as SessionInfo;
            currentSession = sessionInfo;
            return;
          }
        } catch (error) {
          console.error('Error polling for session:', error);
        }
      }, POLL_INTERVAL);

      return {
        content: [
          {
            type: "text",
            text: `Please complete login in your browser at: ${loginUrl}\n\nWaiting for login completion...`
          }
        ]
      };
    } catch (error) {
      console.error('Error starting auth flow:', error);
      return {
        content: [
          {
            type: "text",
            text: "Failed to start authentication flow. Please try again."
          }
        ]
      };
    }
  }
};

export const checkAuthTool = {
  name: "auth.status",
  description: "Check authentication status",
  inputSchema: z.object({}),
  handler: async (): Promise<ToolResponse> => {
    if (!currentToken) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Use auth.login to start authentication flow."
          }
        ]
      };
    }

    if (!currentSession) {
      return {
        content: [
          {
            type: "text",
            text: "Authentication in progress. Please complete login in your browser."
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Authenticated as ${currentSession.content.info.clientname}`
        }
      ]
    };
  }
};