#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import open from 'open';
import { ServerResult, SessionState, TokenResponse } from './types.js';

const sessionState: SessionState = {
  token: null,
  isAuthenticated: false,
  sessionInfo: null
};

class IBAuthServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "IntelligenceBank API Tools",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error): void => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'auth.login',
          description: 'Start browser login flow',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'auth.status',
          description: 'Check authentication status',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'auth.login':
          return this.handleLogin();
        case 'auth.status':
          return this.handleStatus();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleLogin(): Promise<ServerResult> {
    try {
      // Get initial token
      const tokenRes = await fetch(`${process.env.IB_API_URL}/v1/auth/app/token`);
      const { content: token } = await tokenRes.json() as TokenResponse;
      sessionState.token = token;

      // Open browser for login
      const loginUrl = `${process.env.IB_API_URL}/auth/?login=0&token=${token}`;
      await open(loginUrl);

      // Start polling in background
      this.startPolling(token);

      return {
        content: [
          {
            type: "text",
            text: "Browser login window opened. Please complete the login process."
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
        ],
        _meta: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async handleStatus(): Promise<ServerResult> {
    if (!sessionState.token) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Use auth.login to start authentication flow."
          }
        ]
      };
    }

    if (!sessionState.isAuthenticated) {
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
          text: "Successfully authenticated to IntelligenceBank."
        }
      ],
      _meta: {
        sessionInfo: sessionState.sessionInfo
      }
    };
  }

  private async startPolling(token: string): Promise<void> {
    const pollInterval = 2000; // 2 seconds
    const maxPollTime = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    const pollTimer = setInterval(async () => {
      try {
        // Check if we've exceeded max poll time
        if (Date.now() - startTime > maxPollTime) {
          clearInterval(pollTimer);
          sessionState.token = null;
          sessionState.isAuthenticated = false;
          console.error('Login flow expired');
          return;
        }

        // Poll for session info
        const infoRes = await fetch(`${process.env.IB_API_URL}/v1/auth/app/info?token=${token}`);
        
        if (infoRes.status === 404) {
          // Still waiting for login
          return;
        }

        if (infoRes.status === 200) {
          // Login successful!
          clearInterval(pollTimer);
          const sessionInfo = await infoRes.json();
          sessionState.isAuthenticated = true;
          sessionState.sessionInfo = sessionInfo;
          console.log('Login successful');
          return;
        }

      } catch (error) {
        console.error('Error polling for auth:', error);
      }
    }, pollInterval);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('IntelligenceBank Auth MCP server running on stdio');
  }
}

const server = new IBAuthServer();
server.run().catch(console.error);