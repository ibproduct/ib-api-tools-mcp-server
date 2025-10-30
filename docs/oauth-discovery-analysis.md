# OAuth Discovery Analysis - RESOLVED

## Problem Statement

When adding our Remote MCP Server as a Custom Connector to Claude Desktop, the "Connect" action was opening a `claude.ai` internal URL instead of directly opening our OAuth URL (like working MCP servers such as Jira do).

## Root Cause - IDENTIFIED

After thorough investigation and testing, we identified the issue:

### What We Discovered

1. **OAuth Discovery WORKS** ✅
   - Claude Desktop successfully discovers our OAuth endpoints
   - The flow initiates correctly when `client_id: mcp-public-client` is provided
   - Claude opens our authorization URL with proper PKCE parameters

2. **The Actual Problem** ❌
   - Claude Desktop uses its OWN callback URL: `https://claude.ai/api/mcp/auth_callback`
   - Our OAuth bridge's `mcp-public-client` doesn't allow this redirect URI
   - Error: `"redirect_uri does not match allowed patterns for this client"`

### Current Allowed Redirect URIs

The `mcp-public-client` currently allows:
- `https://*.connectingib.com/callback` - Our MCP servers
- `http://localhost:{port}/callback` - Local development
- `http://127.0.0.1:{port}/callback` - Local development

### What Claude Desktop Needs

From [Claude's official documentation](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers):

> **Claude's OAuth callback URL is `https://claude.ai/api/mcp/auth_callback` and its OAuth client name is Claude.**
>
> **This callback URL may change to `https://claude.com/api/mcp/auth_callback` in the future** – if you choose to allowlist MCP client callback URLs, please allowlist this callback URL as well to ensure that your server continues to work with Claude.

## Solution

Update the OAuth bridge's `mcp-public-client` configuration to add Claude Desktop's callback URLs:

```json
{
  "allowedRedirectUris": [
    "https://*.connectingib.com/callback",
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
    "http://localhost:{port}/callback",
    "http://127.0.0.1:{port}/callback"
  ]
}
```

**Note:** Both `claude.ai` and `claude.com` callback URLs should be allowlisted for future compatibility.

## MCP Specification Compliance

### What We Implemented Correctly ✅

1. **RFC 9728 - Protected Resource Metadata**
   - ✅ `/.well-known/oauth-protected-resource` endpoint working
   - ✅ Returns `authorization_servers` array
   - ✅ Lists supported scopes

2. **RFC 8414 - Authorization Server Metadata**
   - ✅ `/.well-known/oauth-authorization-server` endpoint working
   - ✅ Includes `registration_endpoint` (though bridge doesn't support DCR yet)
   - ✅ Advertises PKCE support (S256)
   - ✅ Proper OAuth endpoints

3. **401 Responses with WWW-Authenticate**
   - ✅ Returns proper `WWW-Authenticate` header
   - ✅ Includes `resource_metadata` parameter
   - ✅ Includes `scope` parameter

4. **Initialize Without Auth**
   - ✅ Allows `initialize` without Bearer token
   - ✅ Enables capability discovery before authentication

### MCP Authorization Flow Sequence

According to MCP spec (authorization.md lines 195-216), when Dynamic Client Registration is NOT supported:

> Any authorization servers that *do not* support Dynamic Client Registration need to provide
> alternative ways to obtain a client ID (and, if applicable, client credentials). For one of
> these authorization servers, MCP clients will have to either:
> 
> 1. Hardcode a client ID (and, if applicable, client credentials) specifically for the MCP client to use when
>    interacting with that authorization server, or
> 2. Present a UI to users that allows them to enter these details, after registering an
>    OAuth client themselves (e.g., through a configuration interface hosted by the
>    server).

**We chose option 1:** Using well-known `client_id: mcp-public-client`

From Claude's documentation:
> **As of July, users are also able to specify a custom client ID and client secret when configuring a server that doesn't support DCR.**

This confirms our approach is correct. Claude provides a UI for manual client_id entry when DCR is not available.

### Claude's MCP Support

From official documentation:

**Auth Support:**
- ✅ Supports 3/26 auth spec
- ✅ Supports 6/18 auth spec (as of July)
- ✅ Supports Dynamic Client Registration (DCR)
- ✅ Users can specify custom client ID/secret for non-DCR servers
- ✅ OAuth callback URL: `https://claude.ai/api/mcp/auth_callback`
- ✅ Future callback URL: `https://claude.com/api/mcp/auth_callback`
- ✅ OAuth client name: "Claude"
- ✅ Supports token expiry and refresh

**Transport Support:**
- ✅ Streamable HTTP (our implementation)
- ⚠️ SSE (may be deprecated soon)

**Protocol Features:**
- ✅ Tools (we implement)
- ✅ Prompts (we implement)
- ✅ Resources (we implement)
- ✅ Text and image-based tool results
- ✅ Text and binary resources
- ❌ Resource subscriptions (not yet supported by Claude)
- ❌ Sampling (not yet supported by Claude)

## What We Discovered About MCP Client Behavior

**MCP clients like Claude Desktop:**
1. Discover OAuth endpoints via well-known URIs ✅
2. Use Dynamic Client Registration OR manual client_id entry ✅
3. Handle OAuth callbacks at THEIR OWN URLs ⚠️ (This is the key insight!)
4. Complete token exchange after receiving authorization code ✅

**This means:**
- MCP servers DON'T need a `/callback` endpoint for Claude Desktop
- MCP clients handle their own OAuth state management
- OAuth bridges MUST allow MCP client callback URLs

## Testing Results

### Successful Flow When client_id Provided

```
User adds Custom Connector in Claude Desktop
  ↓
Claude discovers /.well-known/oauth-protected-resource ✅
  ↓
Claude discovers /.well-known/oauth-authorization-server ✅
  ↓
User provides client_id: mcp-public-client manually ✅
  ↓
Claude initiates OAuth with:
  - response_type=code ✅
  - client_id=mcp-public-client ✅
  - redirect_uri=https://claude.ai/api/mcp/auth_callback ⚠️
  - code_challenge=... (PKCE) ✅
  - scope=profile ✅
  - resource=https://mcp.connectingib.com/ ✅
  ↓
OAuth bridge REJECTS: redirect_uri mismatch ❌
```

### Expected Flow After Fix

```
User adds Custom Connector in Claude Desktop
  ↓
Claude discovers OAuth endpoints ✅
  ↓
User provides client_id: mcp-public-client ✅
  ↓
Claude initiates OAuth flow ✅
  ↓
OAuth bridge allows claude.ai callback URL ✅
  ↓
User authenticates on IntelligenceBank platform ✅
  ↓
OAuth bridge redirects to https://claude.ai/api/mcp/auth_callback?code=... ✅
  ↓
Claude exchanges code for tokens at OAuth bridge /token endpoint ✅
  ↓
Claude includes Bearer token in all MCP requests ✅
  ↓
MCP server validates tokens and serves requests ✅
```

## Documentation Updates Needed

### 1. Update mcp-oauth-bridge-integration.md

Add section about MCP client callback URLs:

```markdown
### MCP Client Callback URLs

MCP clients like Claude Desktop handle OAuth callbacks at their own endpoints:

**Claude Desktop:**
- Current: `https://claude.ai/api/mcp/auth_callback`
- Future: `https://claude.com/api/mcp/auth_callback`
- Client name: "Claude"

**Configuration Requirement:**
The `mcp-public-client` configuration MUST allow both callback URLs to ensure
compatibility as Claude transitions domains.
```

### 2. Update authentication-architecture.md

Clarify callback endpoint usage:

```markdown
### Callback Endpoint Usage

Our `/callback` endpoint is used for:
- Tool-based authentication flows (auth_login tool)
- Direct browser authentication
- Testing and development

It is NOT used when Claude Desktop acts as the MCP client, as Claude handles
callbacks at its own endpoint: `https://claude.ai/api/mcp/auth_callback`

**Important:** Different MCP clients may use different callback URLs. The OAuth
bridge must be configured to allow all legitimate MCP client callbacks.
```

### 3. Create claude-desktop-setup.md

Document the complete setup process:

```markdown
# Claude Desktop Setup Guide

## Prerequisites
- Claude Desktop with Pro, Max, Team, or Enterprise plan
- Remote MCP server URL
- OAuth client_id: `mcp-public-client`

## Setup Steps
1. Open Claude Desktop Settings > Connectors
2. Click "Add custom connector"
3. Enter server URL: `https://mcp.connectingib.com/mcp`
4. Enter client_id: `mcp-public-client`
5. Click "Connect"
6. Complete OAuth authentication
7. Grant permissions when prompted

## Troubleshooting
- If redirect_uri error: OAuth bridge needs to allow Claude's callback URL
- If connection fails: Check MCP server is running and accessible
- If authentication fails: Verify client_id is correct
```

## Next Steps

### 1. Update OAuth Bridge Configuration (URGENT)

Add Claude Desktop callback URLs to `mcp-public-client`:

```json
{
  "client_id": "mcp-public-client",
  "client_type": "public",
  "allowed_redirect_uris": [
    "https://*.connectingib.com/callback",
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
    "http://localhost:{port}/callback",
    "http://127.0.0.1:{port}/callback"
  ],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scopes": ["profile"],
  "require_pkce": true,
  "pkce_methods": ["S256"]
}
```

### 2. Test Complete Flow

After OAuth bridge update:
1. Add Custom Connector in Claude Desktop
2. Provide `client_id: mcp-public-client`
3. Complete OAuth authentication on IB platform
4. Verify Claude receives tokens
5. Test MCP operations (tools, prompts, resources)
6. Verify token refresh works

### 3. Consider Dynamic Client Registration

According to Claude's documentation:
> Claude supports Dynamic Client Registration (DCR)

**Benefits of implementing DCR:**
- No manual client_id entry required
- Automatic callback URL registration
- Better user experience
- Claude can register itself automatically

**Implementation:**
- Add `/register` endpoint to OAuth bridge
- Support RFC 7591 Dynamic Client Registration Protocol
- Return client_id dynamically to Claude
- Store registered clients with their callback URLs

### 4. IP Whitelisting (Optional)

From Claude's documentation:
> See here for the IP addresses used by Claude for inbound and outbound connections to MCP servers. Server developers wishing to disallow non-Claude MCP Clients can whitelist these IP addresses, Claude's OAuth callback URL, and/or Claude's OAuth client name.

This can enhance security by ensuring only Claude Desktop can connect.

## Conclusion

Our implementation is **CORRECT** per MCP specification. The issue is purely a configuration problem in the OAuth bridge - it needs to allow Claude Desktop's callback URL.

**Key Points:**
1. ✅ OAuth discovery implementation is correct
2. ✅ MCP protocol implementation is correct
3. ✅ Well-known client configuration approach is valid per spec
4. ❌ OAuth bridge needs callback URL configuration update
5. 🎯 After fix, automatic OAuth flow will work perfectly

## References

- [MCP Authorization Specification](https://spec.modelcontextprotocol.io/specification/architecture/authorization/)
- [Claude's Remote MCP Server Documentation](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 - OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)