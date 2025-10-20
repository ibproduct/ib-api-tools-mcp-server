# Authentication Architecture Audit

## Executive Summary

This document provides a comprehensive audit of the authentication architecture in the IB API Tools MCP Server, addressing the confusion between MCP OAuth authentication and IntelligenceBank session credentials.

## Critical Finding: Legacy Files Must Be Removed

**Status: URGENT - These files should be deleted**

The following files contain old, unused authentication logic from a previous implementation that attempted direct IntelligenceBank API authentication:

1. **`src/auth.ts`** (143 lines)
   - Contains old `authTool` and `checkAuthTool` implementations
   - Uses obsolete token-based polling system to IB API directly
   - **NOT USED** by current architecture
   - **ACTION: DELETE THIS FILE**

2. **`src/auth-state.ts`** (89 lines)
   - Contains old global auth state management
   - Uses polling mechanism that is no longer relevant
   - **NOT USED** by current architecture
   - **ACTION: DELETE THIS FILE**

These legacy files are causing confusion and should be removed immediately. They represent an old architecture where the server attempted to authenticate directly with IntelligenceBank APIs, which has been replaced by the OAuth bridge approach.

---

## Authentication Architecture Overview

The server uses a **dual-authentication system**:

### 1. MCP OAuth Authentication (Protocol Compliance)
- **Purpose**: Satisfy MCP SDK requirement for OAuth 2.0
- **Flow**: Standard OAuth 2.0 PKCE flow via OAuth bridge
- **Tokens**: `access_token`, `refresh_token` (stored but rarely used)
- **Location**: Managed by `SessionManager`, used by MCP protocol

### 2. IntelligenceBank Session Credentials (API Access)
- **Purpose**: Make actual API calls to IntelligenceBank
- **Credentials**: `sid`, `clientId`, `apiV3url`
- **Source**: Extracted from OAuth bridge token response
- **Usage**: `sid` header in all IB API requests

---

## Current Architecture (Refactored Branch)

### File Structure and Purpose

```
src/
├── index.ts                          # Main server entry point (130 lines)
│   └── Orchestrates all components
│
├── session/
│   └── SessionManager.ts             # Session management (86 lines)
│       └── Manages AuthSession objects
│
├── auth/
│   ├── oauth-callback.ts             # OAuth callback handler (169 lines)
│   │   └── Extracts BOTH OAuth tokens AND IB session data
│   ├── oauth-utils.ts                # OAuth utilities (PKCE, state generation)
│   ├── token-manager.ts              # Token refresh logic (unused in practice)
│   └── html-pages.ts                 # Success/error HTML pages (243 lines)
│       └── Displayed after OAuth redirect
│
├── tools/
│   ├── auth-login.tool.ts            # Start OAuth flow MCP tool (77 lines)
│   ├── auth-status.tool.ts           # Check auth status MCP tool (80 lines)
│   └── api-call.tool.ts              # Make IB API calls with sid (176 lines)
│
├── types/
│   └── session.types.ts              # AuthSession interface (35 lines)
│       └── Includes both OAuth tokens AND ibSession
│
├── core/
│   └── tool-registry.ts              # Tool registration helper
│
├── server/
│   └── express-setup.ts              # Express app configuration
│
└── [LEGACY - DELETE]
    ├── auth.ts                       # OLD: Direct IB auth (NOT USED)
    └── auth-state.ts                 # OLD: Polling system (NOT USED)
```

---

## Detailed Component Analysis

### ✅ Core Components (Correct)

#### 1. `src/index.ts` - Main Server
- **Purpose**: Entry point, orchestration
- **Status**: ✅ Correct
- **Key Responsibilities**:
  - Initialize SessionManager
  - Create OAuth callback handler
  - Register MCP tools
  - Set up Express routes (`/callback`, `/mcp`)
  - Handle graceful shutdown

#### 2. `src/session/SessionManager.ts` - Session Management
- **Purpose**: Manage AuthSession lifecycle
- **Status**: ✅ Correct
- **Key Features**:
  - Creates sessions with unique IDs
  - Tracks OAuth state and code verifiers
  - Stores both OAuth tokens AND IB session data
  - Automatic cleanup of expired sessions (5 min TTL)

#### 3. `src/types/session.types.ts` - AuthSession Interface
- **Purpose**: Define session data structure
- **Status**: ✅ Correct - Recently fixed
- **Key Properties**:
  ```typescript
  {
    sessionId: string;           // MCP session tracking
    state: string;               // OAuth state parameter
    codeVerifier: string;        // PKCE code verifier
    
    tokens: {                    // OAuth tokens (for MCP compliance)
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    
    ibSession: {                 // IntelligenceBank credentials (for API calls)
      sid: string;               // THE KEY: Used in all IB API calls
      clientId: string;          // IB client ID (different from OAuth client ID)
      apiV3url: string;          // IB API base URL
      logintimeoutperiod: number; // Session validity (1-120 hours)
      sidExpiry: number;         // Unix timestamp when sid expires
    };
  }
  ```

#### 4. `src/auth/oauth-callback.ts` - OAuth Callback Handler
- **Purpose**: Handle OAuth redirect, exchange code for tokens
- **Status**: ✅ Correct - Recently fixed
- **Critical Logic** (lines 131-145):
  ```typescript
  // Extract IntelligenceBank session data if present
  if (tokens.sid && tokens.clientid && tokens.apiV3url) {
    sessionUpdate.ibSession = {
      sid: tokens.sid,                      // ← Used for all API calls
      clientId: tokens.clientid,            // ← IB client ID
      apiV3url: tokens.apiV3url,            // ← API base URL
      logintimeoutperiod: tokens.logintimeoutperiod,
      sidExpiry: tokens.sidExpiry,
      sidCreatedAt: tokens.sidCreatedAt
    };
  }
  ```

#### 5. `src/tools/api-call.tool.ts` - API Call Tool
- **Purpose**: Make authenticated IB API calls using sid
- **Status**: ✅ Correct - Recently refactored
- **Key Implementation** (lines 89-98):
  ```typescript
  const requestHeaders: Record<string, string> = {
    'sid': session.ibSession.sid,    // ← Direct use of sid
    'Accept': 'application/json',
    ...headers
  };
  ```
- **Features**:
  - Direct API calls (no proxy mode)
  - Handles 401 by marking session as expired
  - Instructs user to re-authenticate via `auth_login`

#### 6. `src/auth/html-pages.ts` - HTML Pages
- **Purpose**: Display success/error pages after OAuth redirect
- **Status**: ✅ Correct
- **User Experience**: Shows "Authentication Successful!" page that user sees in browser

### ✅ MCP Tool Components (Correct)

#### 7. `src/tools/auth-login.tool.ts` - Auth Login Tool
- **Purpose**: MCP tool to start OAuth flow
- **Status**: ✅ Correct
- **Returns**: Authorization URL and session ID

#### 8. `src/tools/auth-status.tool.ts` - Auth Status Tool
- **Purpose**: MCP tool to check authentication status
- **Status**: ✅ Correct
- **Returns**: Session status, tokens (if completed), user info

### ❌ Legacy Components (REMOVE)

#### 9. `src/auth.ts` - OLD AUTH LOGIC
- **Purpose**: OBSOLETE - Direct IB API authentication
- **Status**: ❌ NOT USED - Must be deleted
- **Problem**: Contains old polling-based auth that conflicts with OAuth approach

#### 10. `src/auth-state.ts` - OLD AUTH STATE
- **Purpose**: OBSOLETE - Global auth state for old approach
- **Status**: ❌ NOT USED - Must be deleted
- **Problem**: Manages auth state that is now handled by SessionManager

---

## Authentication Confusion Explained

### The Root Cause

The user reported confusion because the code was mixing up two concepts:

1. **MCP OAuth `sessionId`** - Internal tracking ID for OAuth flow
2. **IntelligenceBank `sid`** - Session credential for API calls

### The Problem

The original implementation attempted to use the OAuth `sessionId` for making IB API calls instead of the `sid` credential that comes from the OAuth bridge's token response.

### The Solution (Now Implemented)

1. **OAuth `sessionId`**: 
   - Generated by SessionManager
   - Used internally to track OAuth flow state
   - Never sent to IntelligenceBank API

2. **IntelligenceBank `sid`**:
   - Extracted from OAuth bridge token response
   - Stored in `session.ibSession.sid`
   - Sent as header in every IB API call
   - Expires based on `logintimeoutperiod` (1-120 hours)

---

## OAuth Token Refresh Strategy

### Current Approach

The codebase includes OAuth token refresh logic (`src/auth/token-manager.ts`), but it's **not actively used** because:

1. **IB session credentials don't expire via OAuth refresh**
   - The `sid` expires based on IntelligenceBank's `logintimeoutperiod`
   - OAuth `refresh_token` cannot extend the `sid` lifetime

2. **On session expiry (401), full re-authentication required**
   - When IB returns 401, the `sid` is expired
   - User must re-authenticate via `auth_login` to get a new `sid`
   - Token refresh would only refresh OAuth tokens, not the `sid`

### Why Keep OAuth Token Refresh?

- **MCP Protocol Compliance**: MCP SDK expects OAuth 2.0 capabilities
- **Future Proofing**: May be useful if OAuth bridge adds token-based session extension
- **Best Practice**: Standard OAuth implementation includes refresh logic

---

## Cross-Session Behavior

### How Claude Handles Sessions

Based on MCP SDK documentation and observed behavior:

1. **OAuth state is NOT persisted across chat sessions**
   - Each new chat creates a fresh MCP connection
   - SessionManager starts empty
   - No session restoration from disk/database

2. **User must re-authenticate for each new chat**
   - Chat Session A: User authenticates → gets `sessionId_A`
   - Chat Session B (new): User must authenticate again → gets `sessionId_B`

3. **Within a single chat session**
   - Authentication persists for the chat duration
   - `sessionId` is valid for tool calls
   - Expires after 5 minutes of inactivity (SessionManager TTL)

### Recommendation

For production use, consider implementing persistent session storage:
- Store encrypted sessions in database
- Restore sessions on server restart
- Validate `sid` expiry before use
- Re-authenticate only when `sid` actually expires (not on each chat)

---

## Directory Structure Clarification

### Why Both `src/auth/` and `src/tools/`?

This is a **correct separation of concerns**:

#### `src/auth/` - OAuth Protocol Implementation
- **Purpose**: OAuth 2.0 protocol mechanics
- **Files**:
  - `oauth-callback.ts` - Handle OAuth redirect callback
  - `oauth-utils.ts` - PKCE utilities (code verifier, challenge, state)
  - `token-manager.ts` - Token refresh logic
  - `html-pages.ts` - UI for OAuth flow

#### `src/tools/` - MCP Tool Interface
- **Purpose**: Expose authentication as MCP tools
- **Files**:
  - `auth-login.tool.ts` - MCP tool: "start auth flow"
  - `auth-status.tool.ts` - MCP tool: "check auth status"
  - `api-call.tool.ts` - MCP tool: "make API call"

**This separation is good architecture**:
- `auth/` = How OAuth works internally
- `tools/` = How Claude interacts with authentication

---

## Recommendations

### Immediate Actions

1. **✅ DELETE legacy files**:
   ```bash
   rm src/auth.ts src/auth-state.ts
   ```

2. **✅ Verify build succeeds**:
   ```bash
   npm run build
   ```

3. **✅ Update documentation**:
   - Remove references to old auth approach
   - Document dual-authentication clearly
   - Add session persistence recommendations

### Future Enhancements

1. **Persistent Session Storage**
   - Store sessions in Redis/database
   - Restore on server restart
   - Track `sid` expiry accurately

2. **Better Session Lifecycle Management**
   - Validate `sid` before each API call
   - Proactively refresh if close to expiry
   - Background job to clean up expired sessions

3. **Enhanced Error Handling**
   - Detect specific IB API error codes
   - Provide better user guidance
   - Auto-retry with exponential backoff

---

## Summary

### Current State: ✅ Architecture is Correct (Except Legacy Files)

The refactored branch implements the dual-authentication system correctly:
- OAuth for MCP protocol compliance ✅
- IntelligenceBank `sid` for API calls ✅
- Proper extraction and storage of credentials ✅
- Direct API calls with `sid` header ✅

### Critical Issue: ❌ Legacy Files Cause Confusion

- `src/auth.ts` and `src/auth-state.ts` are **obsolete**
- They represent an abandoned approach
- They must be deleted to avoid confusion

### Conclusion

Once the legacy files are removed, the architecture will be clean and correctly implements the dual-authentication pattern required by both MCP protocol and IntelligenceBank API.
