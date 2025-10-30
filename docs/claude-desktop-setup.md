# Claude Desktop Setup Guide

## Quick Setup for IntelligenceBank API Tools MCP Server

This guide shows you how to add the IntelligenceBank API Tools MCP Server to Claude Desktop as a Custom Connector.

## Prerequisites

- Claude Desktop installed
- Access to an IntelligenceBank platform

## Setup Steps

### 1. Open Claude Desktop Settings

1. Launch Claude Desktop
2. Click your profile icon (bottom left)
3. Select **"Settings"**
4. Navigate to **"Connectors"** section

### 2. Add Custom Connector

1. Scroll to the bottom of the Connectors page
2. Click **"Add custom connector"**

A dialog will appear prompting for server configuration.

### 3. Enter Server Configuration

**IMPORTANT:** You must provide the `client_id` for OAuth authentication to work.

Enter these values:

```
Server URL:    https://mcp.connectingib.com/mcp
client_id:     mcp-public-client
client_secret: (leave empty)
```

**Why these values?**
- **Server URL:** Our production MCP server endpoint
- **client_id:** Well-known public client ID (required for OAuth)
- **client_secret:** Not needed (we use PKCE for public clients)

### 4. Click "Add"

Claude will connect to the server and initiate the OAuth flow.

### 5. Complete OAuth Authentication

1. A browser window will open (or you'll see an authentication prompt)
2. Enter your **IntelligenceBank platform URL** (e.g., `https://yourcompany.intelligencebank.com`)
3. Complete the login in the popup window
4. You'll see a success message: **"✓ Authentication Successful!"**
5. Close the browser window

### 6. Configure Tool Permissions

1. Return to Claude Desktop settings
2. Navigate to your newly added connector
3. Review and enable the tools you want Claude to use:
   - `api_call` - Make authenticated API calls
   - `upload_file` - Upload files for compliance reviews
   - `get_compliance_filters` - Get available filters
   - `run_file_compliance_review` - Run compliance reviews
   - Additional authentication and status tools

### 7. Start Using the Connector

1. Start a new conversation in Claude
2. Click the paperclip icon (📎) to access resources
3. You'll see IntelligenceBank resources available
4. Ask Claude to help with tasks like:
   - "Browse my IntelligenceBank resources"
   - "Run a compliance review on this file"
   - "Search for resources tagged with 'marketing'"

## Troubleshooting

### "Configure" Status Showing

If the connector shows "Configure" status instead of "Connected":

**Solution:** Make sure you entered the `client_id` field:
- `client_id: mcp-public-client`

Without the client_id, Claude cannot complete OAuth authentication.

### Authentication Failed

If authentication fails:

1. **Check Platform URL:** Ensure you entered your correct IntelligenceBank platform URL
2. **Check Credentials:** Verify your IntelligenceBank username and password
3. **Retry:** Click "Configure" to retry authentication

### Cannot Access Resources

If you can't see IntelligenceBank resources:

1. **Check Authentication:** Verify connector shows "Connected" status
2. **Re-authenticate:** Remove and re-add the connector
3. **Check Permissions:** Ensure your IntelligenceBank user has resource access

## Development Setup

For local development and testing:

```
Server URL:    http://localhost:3000/mcp
client_id:     mcp-public-client
client_secret: (leave empty)
```

**Note:** Make sure your local server is running before adding the connector.

## Configuration File (Alternative)

You can also configure the connector via the Claude Desktop config file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "intelligencebank": {
      "url": "https://mcp.connectingib.com/mcp",
      "transport": {
        "type": "http"
      },
      "oauth": {
        "client_id": "mcp-public-client"
      }
    }
  }
}
```

## Available Tools

Once connected, Claude can use these tools:

### Authentication Tools
- `auth_status` - Check authentication status
- `auth_login` - Start OAuth login (if not authenticated)

### API Tools
- `api_call` - Make authenticated API calls to IntelligenceBank
- Automatic token refresh
- Session management

### File Tools
- `upload_file` - Upload files for processing (required for remote compliance reviews)

### Compliance Review Tools
- `get_compliance_filters` - Get available category filters (Channel, Market, Region, etc.)
- `run_file_compliance_review` - Run comprehensive compliance review on a file
  - Uploads file
  - Creates review with selected filters
  - Polls for completion
  - Returns detailed findings

### Available Prompts
- `compliance_review_help` - Guided workflow for running file compliance reviews

### MCP Resources
- Browse IntelligenceBank resources directly
- URI scheme: `ib://{clientid}/resource/{resourceId}`
- Supports keyword search
- Sorted by last update time
- Returns up to 100 resources per page

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review server logs at [https://mcp.connectingib.com/status](https://mcp.connectingib.com/status)
3. Contact IntelligenceBank support

## Technical Details

### OAuth Flow
- Uses OAuth 2.1 with PKCE (Proof Key for Code Exchange)
- Well-known public client configuration (`mcp-public-client`)
- No client_secret required (public client)
- Automatic token refresh
- Session-based authentication tracking

### Security
- HTTPS required for production
- PKCE prevents authorization code interception
- Access tokens expire after 1 hour
- Refresh tokens for seamless reauthentication
- Session data stored securely

### Architecture
- Remote MCP server (HTTP transport)
- Streamable HTTP with SSE support
- Session management with `Mcp-Session-Id` header
- OAuth bridge integration with IntelligenceBank platforms

## Version Information

- **MCP Server Version:** 0.2.0
- **MCP Protocol Version:** 2024-11-05
- **OAuth Bridge:** IntelligenceBank OAuth 2.0 Bridge
- **Client ID:** `mcp-public-client` (well-known public client)