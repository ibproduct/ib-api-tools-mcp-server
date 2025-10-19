# Tools Structure Refactoring Plan

## Overview

This document outlines a comprehensive plan to refactor the MCP server's tools structure to follow best practices and improve maintainability, scalability, and consistency.

## Current Implementation (January 2025)

### Automatic OAuth Callback Flow

**What We Have Now:**
```
src/
├── index.ts              # ~920 lines - includes session management, callback endpoint, and all tool definitions
├── auth.ts               # Legacy (to be removed)
├── auth-state.ts         # Legacy (to be removed)
├── types.ts              # Shared types
└── tools/
    └── status.ts         # ❌ Exists but NEVER imported or used!
```

**Current Tools (3 active):**
1. **`auth_login`** - Initiates OAuth flow, returns sessionId and authorization URL
2. **`auth_status`** - Checks authentication status by sessionId, returns tokens when complete
3. **`api_call`** - Makes authenticated API calls with automatic token refresh

**Removed:**
- **`auth_exchange`** - Deprecated (callback endpoint handles this automatically)

### New Features Implemented

**Session Management (lines 13-64):**
- In-memory session storage with 5-minute TTL
- Automatic session cleanup every minute
- Session tracking with sessionId
- Stores: tokens, userInfo (including `clientid`, `apiV3url`, `sid`), PKCE parameters

**OAuth Callback Endpoint (lines 84-191):**
- GET `/callback` - Handles OAuth redirects
- Automatic authorization code exchange
- User information retrieval
- Beautiful HTML success/error pages
- Updates session with tokens and user data

**Token Refresh (lines 590-646):**
- `refreshAccessToken()` helper function
- Automatic refresh on 401 errors
- Session expiry detection
- Re-authentication prompts

### Current Structure Issues

**Problems Identified:**

1. **Orphaned Tool**: [`status.ts`](../src/tools/status.ts) exists but is never imported or registered

2. **Inline Tool Definitions**: All 3 tools are hardcoded in [`index.ts`](../src/index.ts):
   - `auth_login` (lines 448-519)
   - `auth_status` (lines 521-587)
   - `api_call` (lines 648-832)

3. **Mixed Concerns**: [`index.ts`](../src/index.ts) now contains:
   - Session management logic
   - OAuth callback endpoint
   - HTML page generators
   - Tool definitions
   - Server setup
   - Helper functions

4. **Not Scalable**: File has grown to ~920 lines, making it difficult to maintain

## Target Structure

### MCP SDK Best Practice Structure

```
src/
├── index.ts                    # ~100 lines - server setup only
├── types.ts                    # Shared types
├── utils/
│   └── pkce.ts                # PKCE helper functions
└── tools/
    ├── index.ts               # Central tool registry & exports
    ├── auth/
    │   ├── login.ts          # auth_login tool definition & handler
    │   ├── exchange.ts       # auth_exchange tool definition & handler
    │   └── check-status.ts   # auth_status tool definition & handler
    └── system/
        └── health.ts         # Server health check (renamed from status.ts)
```

## Implementation Plan

### Phase 1: Extract Utilities

**File**: `src/utils/pkce.ts`

Extract PKCE helper functions from `index.ts` (lines 268-295):
- `generateCodeVerifier(): string`
- `generateCodeChallenge(verifier: string): Promise<string>`
- `generateState(): string`

**Implementation**:
```typescript
// src/utils/pkce.ts

/**
 * Generate a random code verifier for PKCE flow
 * @returns Base64url-encoded random string (32 bytes)
 */
export function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Generate code challenge from verifier using SHA-256
 * @param verifier The code verifier string
 * @returns Base64url-encoded SHA-256 hash
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Generate random state parameter for CSRF protection
 * @returns Base64url-encoded random string (16 bytes)
 */
export function generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
```

### Phase 2: Create Auth Tools

#### File 1: `src/tools/auth/login.ts`

Extract `auth_login` tool from `index.ts` (lines 27-82).

**Structure**:
```typescript
import { z } from 'zod';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../../utils/pkce.js';

export const authLoginTool = {
    name: 'auth_login',
    definition: {
        title: 'OAuth Login',
        description: 'Start OAuth 2.0 login flow with IntelligenceBank',
        inputSchema: {
            platformUrl: z.string().optional()
                .describe('IntelligenceBank platform URL (e.g., https://company.intelligencebank.com)')
        },
        outputSchema: {
            authorizationUrl: z.string(),
            state: z.string(),
            codeVerifier: z.string()
        }
    }
};

export async function handleAuthLogin({ platformUrl }: { platformUrl?: string }) {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const clientId = process.env.OAUTH_CLIENT_ID || 'ib-api-tools-mcp-server';
    const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
    const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

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
        state,
        codeVerifier
    };

    return {
        content: [{
            type: 'text',
            text: JSON.stringify(output, null, 2)
        }],
        structuredContent: output
    };
}
```

#### File 2: `src/tools/auth/exchange.ts`

Extract `auth_exchange` tool from `index.ts` (lines 84-157).

**Structure**:
```typescript
import { z } from 'zod';

export const authExchangeTool = {
    name: 'auth_exchange',
    definition: {
        title: 'Exchange Authorization Code',
        description: 'Exchange authorization code for access tokens',
        inputSchema: {
            code: z.string().describe('Authorization code from OAuth callback'),
            codeVerifier: z.string().describe('PKCE code verifier from login'),
            state: z.string().optional().describe('State parameter for validation')
        },
        outputSchema: {
            accessToken: z.string(),
            tokenType: z.string(),
            expiresIn: z.number(),
            refreshToken: z.string().optional()
        }
    }
};

export async function handleAuthExchange({ code, codeVerifier }: { code: string; codeVerifier: string }) {
    const clientId = process.env.OAUTH_CLIENT_ID || 'ib-api-tools-mcp-server';
    const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
    const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

    try {
        const response = await fetch(`${bridgeUrl}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                code_verifier: codeVerifier
            })
        });

        if (!response.ok) {
            const error = await response.json();
            return {
                content: [{
                    type: 'text',
                    text: `Token exchange failed: ${error.error_description || error.error}`
                }],
                isError: true
            };
        }

        const tokens = await response.json();
        const output = {
            accessToken: tokens.access_token,
            tokenType: tokens.token_type,
            expiresIn: tokens.expires_in,
            refreshToken: tokens.refresh_token
        };

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(output, null, 2)
            }],
            structuredContent: output
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `Error exchanging code: ${error instanceof Error ? error.message : 'Unknown error'}`
            }],
            isError: true
        };
    }
}
```

#### File 3: `src/tools/auth/check-status.ts`

Extract `auth_status` tool from `index.ts` (lines 159-221).

**Structure**:
```typescript
import { z } from 'zod';

export const authStatusTool = {
    name: 'auth_status',
    definition: {
        title: 'Authentication Status',
        description: 'Check current authentication status and user information',
        inputSchema: {
            accessToken: z.string().describe('Access token to validate')
        },
        outputSchema: {
            authenticated: z.boolean(),
            userInfo: z.object({
                sub: z.string(),
                name: z.string().optional(),
                email: z.string().optional(),
                ib_client_id: z.string().optional(),
                ib_api_url: z.string().optional()
            }).optional()
        }
    }
};

export async function handleAuthStatus({ accessToken }: { accessToken: string }) {
    const bridgeUrl = process.env.OAUTH_BRIDGE_URL || 'https://66qz7xd2w8.execute-api.us-west-1.amazonaws.com/dev';

    try {
        const response = await fetch(`${bridgeUrl}/userinfo`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({ authenticated: false })
                }],
                structuredContent: { authenticated: false }
            };
        }

        const userInfo = await response.json();
        const output = {
            authenticated: true,
            userInfo
        };

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(output, null, 2)
            }],
            structuredContent: output
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `Error checking status: ${error instanceof Error ? error.message : 'Unknown error'}`
            }],
            isError: true
        };
    }
}
```

### Phase 3: Rename System Tool

**From**: `src/tools/status.ts`  
**To**: `src/tools/system/health.ts`

Update the tool to follow the same pattern:

```typescript
import { z } from 'zod';

export const healthTool = {
    name: 'health',
    definition: {
        description: 'Check server and authentication status',
        inputSchema: z.object({})
    }
};

export async function handleHealth() {
    return {
        content: [{
            type: 'text',
            text: 'Server is running. Use the auth capability to authenticate.'
        }]
    };
}
```

### Phase 4: Create Tool Registry

**File**: `src/tools/index.ts`

Central export point for all tools:

```typescript
// Auth tools
export * from './auth/login.js';
export * from './auth/exchange.js';
export * from './auth/check-status.js';

// System tools
export * from './system/health.js';

// Tool collection for easy registration
import { authLoginTool, handleAuthLogin } from './auth/login.js';
import { authExchangeTool, handleAuthExchange } from './auth/exchange.js';
import { authStatusTool, handleAuthStatus } from './auth/check-status.js';
import { healthTool, handleHealth } from './system/health.js';

export const allTools = [
    { tool: authLoginTool, handler: handleAuthLogin },
    { tool: authExchangeTool, handler: handleAuthExchange },
    { tool: authStatusTool, handler: handleAuthStatus },
    { tool: healthTool, handler: handleHealth }
];
```

### Phase 5: Update Main Server File

**File**: `src/index.ts`

Simplify from 295 lines to ~100 lines:

```typescript
#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { allTools } from './tools/index.js';

// Create Express app
const app = express();
app.use(express.json());

// Configure CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id']
}));

// Create MCP server
const server = new McpServer({
    name: 'IntelligenceBank API Tools',
    version: '0.1.0'
});

// Register all tools
for (const { tool, handler } of allTools) {
    server.registerTool(tool.name, tool.definition, handler);
}

// MCP endpoint - POST for requests, GET for notifications
app.post('/mcp', async (req, res) => {
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
            enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION === 'true',
            allowedHosts: process.env.ALLOWED_HOSTS?.split(',') || []
        });

        res.on('close', () => {
            transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

// Start server
const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
    console.log(`IntelligenceBank API Tools MCP Server running on http://localhost:${port}/mcp`);
    console.log('Available tools:');
    for (const { tool } of allTools) {
        console.log(`  - ${tool.name}: ${tool.definition.description || tool.definition.title}`);
    }
}).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});
```

### Phase 6: Update Types (Optional)

**File**: `src/types.ts`

Add tool-specific types if needed:

```typescript
// MCP Response types
export interface ServerResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    _meta?: {
        [key: string]: unknown;
    };
}

// Tool handler return type
export interface ToolResponse {
    content: Array<{
        type: "text";
        text: string;
    }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}

// OAuth-specific types
export interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
}

export interface UserInfo {
    sub: string;
    name?: string;
    email?: string;
    ib_client_id?: string;
    ib_api_url?: string;
}

// Session state (legacy, may remove later)
export interface SessionState {
    token: string | null;
    isAuthenticated: boolean;
    sessionInfo: unknown | null;
}
```

## Testing Checklist

After refactoring, verify the following:

### Build & Compile
- [ ] `npm run build` succeeds without errors
- [ ] No TypeScript compilation errors
- [ ] All imports resolve correctly

### Local Development
- [ ] `npm run dev` starts server successfully
- [ ] All 4 tools appear in server console output
- [ ] Server responds on http://localhost:3000/mcp

### MCP Protocol Testing
- [ ] MCP Inspector connects successfully
- [ ] `initialize` method works
- [ ] `tools/list` returns all 4 tools

### Tool Functionality
- [ ] `auth_login` tool works (returns authorizationUrl)
- [ ] `auth_exchange` tool works (exchanges code for token)
- [ ] `auth_status` tool works (validates token)
- [ ] `health` tool works (returns server status)

### Integration Testing
- [ ] Claude Desktop can connect to local server
- [ ] End-to-end OAuth flow completes successfully
- [ ] No runtime errors in console
- [ ] Error handling works correctly

### Production Deployment
- [ ] Build on EC2: `sudo npm run build`
- [ ] Restart PM2: `pm2 restart ib-mcp-server`
- [ ] Check logs: `pm2 logs ib-mcp-server --lines 20`
- [ ] Test HTTPS endpoint: `curl -X POST https://mcp.connectingib.com/mcp`
- [ ] Verify tools list via MCP Inspector on production

## Benefits

### Maintainability
- ✅ Each tool in its own file (single responsibility principle)
- ✅ `index.ts` reduced from 295 to ~100 lines
- ✅ Easy to find and modify specific tools
- ✅ Clear separation of concerns

### Scalability
- ✅ Clear pattern for adding new IB API tools
- ✅ Organized by domain (auth/, system/, future: assets/, workspaces/)
- ✅ Can grow to 20+ tools without chaos

### Consistency
- ✅ All tools follow the same structure
- ✅ Predictable file locations
- ✅ Unified export pattern

### Testability
- ✅ Individual tool files can be unit tested
- ✅ Mock dependencies easily
- ✅ Isolated handler logic

## File Changes Summary

### New Files (7)
1. `src/utils/pkce.ts` - PKCE helper functions
2. `src/tools/auth/login.ts` - auth_login tool
3. `src/tools/auth/exchange.ts` - auth_exchange tool
4. `src/tools/auth/check-status.ts` - auth_status tool
5. `src/tools/system/health.ts` - health check tool (renamed)
6. `src/tools/index.ts` - Tool registry
7. New directories: `src/utils/`, `src/tools/auth/`, `src/tools/system/`

### Modified Files (2)
1. `src/index.ts` - Simplified to ~100 lines, imports tools from registry
2. `src/types.ts` - Add tool-specific types (optional)

### Deleted Files (1)
1. `src/tools/status.ts` - Moved to `src/tools/system/health.ts`

## Implementation Steps

1. **Create `src/utils/pkce.ts`** - Extract helper functions
2. **Create `src/tools/auth/login.ts`** - Extract auth_login tool
3. **Create `src/tools/auth/exchange.ts`** - Extract auth_exchange tool
4. **Create `src/tools/auth/check-status.ts`** - Extract auth_status tool
5. **Move `src/tools/status.ts` → `src/tools/system/health.ts`** - Rename and update
6. **Create `src/tools/index.ts`** - Central tool registry
7. **Update `src/index.ts`** - Simplify and import from registry
8. **Update `src/types.ts`** - Add tool-specific types (optional)
9. **Test locally** - Verify all tools work
10. **Update documentation** - Reflect new structure in codebaseSummary.md

## Next Steps

Choose your implementation approach:

### Option A: Manual Implementation (Recommended for Learning)
Follow this plan step-by-step, creating each file as documented.

### Option B: Request Full Implementation
Switch to Code mode and ask to implement all files automatically based on this plan.

### Option C: Incremental Refactoring
Start with one tool (e.g., `auth/login.ts`) as a proof-of-concept, then expand.

## Future Enhancements

Once refactoring is complete, the structure will support:

1. **IntelligenceBank API Tools** (`tools/ib/`):
   - `assets/get-asset.ts`
   - `assets/search-assets.ts`
   - `workspaces/list-workspaces.ts`
   - `users/get-user.ts`
   - `collections/manage-collection.ts`

2. **Testing Suite**:
   - Unit tests for each tool handler
   - Integration tests for OAuth flow
   - E2E tests with test IB instance

3. **Documentation**:
   - Auto-generated tool reference from schemas
   - Usage examples for each tool
   - API documentation

## References

- MCP SDK Documentation: https://github.com/modelcontextprotocol/sdk
- Current implementation: [`src/index.ts`](../src/index.ts), [`src/tools/status.ts`](../src/tools/status.ts)
- Project roadmap: [`projectRoadmap.md`](projectRoadmap.md)
- Tech stack: [`techStack.md`](techStack.md)