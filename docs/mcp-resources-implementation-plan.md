# MCP Resources Implementation Plan for IntelligenceBank

## Executive Summary

This document outlines the implementation plan for adding MCP Resources support to the IntelligenceBank API Tools MCP Server. This feature will enable Claude to browse IntelligenceBank folders and files directly through a resource interface, similar to how Google Docs and other connectors present their file structures.

## Current Observation

When clicking "+ / Add action" in Claude:
- **Google Docs**: Shows a direct list of files as resources
- **IntelligenceBank (desired)**: Should show "Add from IntelligenceBank" with browsable folder/file structure
- **Current IntelligenceBank**: Only provides tools, no resource browsing capability

## MCP Resources Protocol Overview

### What Are MCP Resources?

MCP Resources provide a standardized way for servers to expose data sources that can be used as context for language models. Resources are identified by URIs and can be listed, read, and optionally subscribed to for updates.

### Key Protocol Features

1. **Resource Listing**: `resources/list` method with pagination
2. **Resource Reading**: `resources/read` method to retrieve content
3. **Resource Updates**: Optional `resources/subscribe` and `resources/unsubscribe` for change notifications
4. **Resource Templates**: URI templates for dynamic resource generation

## IntelligenceBank API Analysis

### Folders API

**Endpoint**: `GET /api/3.0.0/{clientid}/folder.limit(100).order(createTime)`

**Authentication**: Requires `sid` header (session ID)

**Response Structure**:
```json
{
  "response": {
    "rows": [
      {
        "_id": "2ad3d794d7e41b261e1efd44191925e4",
        "name": "Archive",
        "parent": "02b0623f66b2c165ad4a86d1a1c1539c",
        "description": "Archive folder description",
        "thumbnail": "https://...",
        "folders_count": 0,
        "resources_count": 0,
        "isPublic": false,
        "allowedActions": ["view", "publish", "list", "admin"]
      }
    ],
    "offset": 0,
    "count": 17
  }
}
```

**Key Fields**:
- `_id`: Unique folder identifier
- `name`: Folder name
- `parent`: Parent folder ID (root folders have specific parent ID)
- `folders_count`: Number of subfolders
- `resources_count`: Number of files in folder
- `allowedActions`: User permissions for the folder

### Resources API

**Endpoint**: `GET /api/3.0.0/{clientid}/resource.limit(100).order(createTime:-1)`

**Authentication**: Requires `sid` header (session ID)

**Query Parameters**:
- `searchParams[ib_folder_s]`: Filter by folder ID
- `searchParams[keywords]`: Search by keywords
- `.limit(offset, count)`: Pagination
- `.fields()`: Restrict returned fields

**Response Structure**:
```json
{
  "response": {
    "rows": [
      {
        "_id": "e9608e402a607816531e3de298af5b13",
        "name": "4",
        "folder": "0b05125e264d902a302a50fa07bcbe6a",
        "folderPath": [
          {"name": "Resources", "_id": "02b0623f66b2c165ad4a86d1a1c1539c"},
          {"name": "Zapier Test Folder", "_id": "0b05125e264d902a302a50fa07bcbe6a"}
        ],
        "file": {
          "type": "image/png",
          "name": "4.png",
          "size": 4236,
          "hash": "0cb5ac37ba0e3532d0ed48e8ae261797"
        },
        "thumbnail": "https://...",
        "fancyFileType": "Image (png)",
        "fancyFileSize": "4.14 KB",
        "createTime": "2020-01-08T15:15:02Z",
        "lastUpdateTime": "2020-01-08T15:15:03Z",
        "tags": ["silhouette"],
        "allowedActions": ["view", "publish", "list", "admin"]
      }
    ],
    "offset": 0,
    "count": 153
  }
}
```

**Key Fields**:
- `_id`: Unique resource identifier
- `name`: File name
- `folder`: Parent folder ID
- `folderPath`: Array of parent folders (breadcrumb)
- `file.type`: MIME type
- `file.size`: File size in bytes
- `thumbnail`: Thumbnail URL
- `tags`: Associated tags
- `allowedActions`: User permissions

## Proposed Resource URI Scheme

### URI Structure

```
ib://{clientid}/folders/{folderId}
ib://{clientid}/resources/{resourceId}
ib://{clientid}/folders/{folderId}/resources
ib://{clientid}/search?q={query}
```

### Examples

```
ib://fe97709573d7929e8cba2f21fa8fb1ca/folders/root
ib://fe97709573d7929e8cba2f21fa8fb1ca/folders/2ad3d794d7e41b261e1efd44191925e4
ib://fe97709573d7929e8cba2f21fa8fb1ca/resources/e9608e402a607816531e3de298af5b13
ib://fe97709573d7929e8cba2f21fa8fb1ca/folders/0b05125e264d902a302a50fa07bcbe6a/resources
ib://fe97709573d7929e8cba2f21fa8fb1ca/search?q=logo
```

### URI Components

- **Scheme**: `ib://` (IntelligenceBank custom scheme)
- **Authority**: `{clientid}` (tenant identifier from session)
- **Path**: Resource type and identifier
- **Query**: Optional search parameters

## Authentication Architecture

### Challenge: Dual Authentication System

The IntelligenceBank MCP server uses a dual authentication approach:

1. **OAuth 2.0**: For MCP protocol compliance and secure authorization
2. **Session ID (sid)**: For actual IB API calls

### Current Authentication Flow

```
User → Browser Login → OAuth Flow → Access Token → Session Manager → sid
                                                                        ↓
                                                        IB API Calls (with sid header)
```

### Resource Access Authentication

**Problem**: Resources must be accessed using the authenticated user's session

**Solution**: Resources are inherently tied to authenticated sessions

```typescript
// Pseudo-code for resource access
async function handleResourceRead(uri: string, sessionId: string) {
  const session = sessionManager.getSession(sessionId);
  if (!session?.credentials?.sid) {
    throw new Error('Not authenticated');
  }
  
  // Use session's sid for API calls
  const resource = await fetchResourceFromIB(uri, session.credentials.sid);
  return resource;
}
```

### Authentication Imperatives

1. **Session-Scoped Resources**: All resources MUST be retrieved using the authenticated session's `sid`
2. **No Anonymous Access**: Resources cannot be accessed without valid authentication
3. **Permission Enforcement**: Resource listing respects user's `allowedActions` from IB API
4. **Token Refresh**: OAuth tokens must be refreshed before expiry to maintain `sid` validity
5. **Session Isolation**: Each MCP client session maintains its own authentication context

## Implementation Architecture

### 1. Server Capability Declaration

```typescript
// src/index.ts
server.setRequestHandler(InitializeRequestSchema, async () => {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      resources: {
        subscribe: true,      // Support resource change notifications
        listChanged: true     // Support list change notifications
      }
    },
    serverInfo: {
      name: "ib-api-tools-mcp-server",
      version: "1.0.0"
    }
  };
});
```

### 2. Resource List Handler

```typescript
// src/resources/resource-handlers.ts
import { ListResourcesRequestSchema } from "@modelcontextprotocol/sdk/types.js";

server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
  const sessionId = extra.sessionId; // From MCP context
  const session = sessionManager.getSession(sessionId);
  
  if (!session?.credentials?.sid) {
    throw new Error('Authentication required to list resources');
  }

  // Get client ID from session
  const clientId = session.credentials.clientId;
  const cursor = request.params?.cursor;

  try {
    // Fetch root folders from IB API
    const folders = await fetchFolders({
      sid: session.credentials.sid,
      clientId,
      parent: 'root', // or parse from cursor
      limit: 50
    });

    const resources = folders.rows.map(folder => ({
      uri: `ib://${clientId}/folders/${folder._id}`,
      name: folder.name,
      description: folder.description || `Folder with ${folder.resources_count} files`,
      mimeType: 'application/vnd.intelligencebank.folder',
      annotations: {
        audience: ['user'],
        priority: folder.isPublic ? 0.8 : 0.5
      }
    }));

    return {
      resources,
      nextCursor: folders.offset + folders.rows.length < folders.count
        ? `offset:${folders.offset + folders.rows.length}`
        : undefined
    };
  } catch (error) {
    console.error('Error listing resources:', error);
    throw error;
  }
});
```

### 3. Resource Read Handler

```typescript
server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
  const sessionId = extra.sessionId;
  const session = sessionManager.getSession(sessionId);
  
  if (!session?.credentials?.sid) {
    throw new Error('Authentication required to read resources');
  }

  const uri = request.params.uri;
  const parsed = parseResourceURI(uri);

  if (parsed.type === 'folder') {
    return await readFolder(parsed, session);
  } else if (parsed.type === 'resource') {
    return await readResource(parsed, session);
  } else if (parsed.type === 'folder-resources') {
    return await readFolderResources(parsed, session);
  }

  throw new Error(`Unknown resource type: ${uri}`);
});

async function readFolder(parsed: ParsedURI, session: Session) {
  const folders = await fetchFolders({
    sid: session.credentials.sid,
    clientId: parsed.clientId,
    parent: parsed.folderId,
    limit: 100
  });

  const content = {
    type: 'folder',
    id: parsed.folderId,
    name: folders.rows[0]?.name || 'Root',
    subfolders: folders.rows.map(f => ({
      id: f._id,
      name: f.name,
      resourceCount: f.resources_count,
      folderCount: f.folders_count
    }))
  };

  return {
    contents: [
      {
        uri: `ib://${parsed.clientId}/folders/${parsed.folderId}`,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2)
      }
    ]
  };
}

async function readResource(parsed: ParsedURI, session: Session) {
  const resources = await fetchResources({
    sid: session.credentials.sid,
    clientId: parsed.clientId,
    resourceId: parsed.resourceId
  });

  const resource = resources.rows[0];
  if (!resource) {
    throw new Error('Resource not found');
  }

  const content = {
    type: 'resource',
    id: resource._id,
    name: resource.name,
    fileType: resource.file.type,
    fileSize: resource.fancyFileSize,
    thumbnail: resource.thumbnail,
    tags: resource.tags,
    folderPath: resource.folderPath,
    downloadUrl: `${IB_API_BASE_URL}/download/${resource._id}`,
    metadata: {
      created: resource.createTime,
      updated: resource.lastUpdateTime,
      creator: resource.creatorName,
      dimensions: resource.imageWidth && resource.imageHeight
        ? `${resource.imageWidth}x${resource.imageHeight}`
        : undefined
    }
  };

  return {
    contents: [
      {
        uri: `ib://${parsed.clientId}/resources/${parsed.resourceId}`,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2)
      }
    ]
  };
}
```

### 4. URI Parser Utility

```typescript
// src/utils/uri-parser.ts
interface ParsedURI {
  scheme: string;
  clientId: string;
  type: 'folder' | 'resource' | 'folder-resources' | 'search';
  folderId?: string;
  resourceId?: string;
  searchQuery?: string;
}

export function parseResourceURI(uri: string): ParsedURI {
  const url = new URL(uri);
  
  if (url.protocol !== 'ib:') {
    throw new Error('Invalid URI scheme');
  }

  const clientId = url.hostname;
  const pathParts = url.pathname.split('/').filter(p => p);

  if (pathParts[0] === 'folders' && pathParts.length === 2) {
    return {
      scheme: 'ib',
      clientId,
      type: 'folder',
      folderId: pathParts[1]
    };
  }

  if (pathParts[0] === 'folders' && pathParts[2] === 'resources') {
    return {
      scheme: 'ib',
      clientId,
      type: 'folder-resources',
      folderId: pathParts[1]
    };
  }

  if (pathParts[0] === 'resources' && pathParts.length === 2) {
    return {
      scheme: 'ib',
      clientId,
      type: 'resource',
      resourceId: pathParts[1]
    };
  }

  if (pathParts[0] === 'search') {
    return {
      scheme: 'ib',
      clientId,
      type: 'search',
      searchQuery: url.searchParams.get('q') || ''
    };
  }

  throw new Error(`Invalid resource URI: ${uri}`);
}
```

### 5. IB API Client Functions

```typescript
// src/api/ib-api-client.ts
interface FetchFoldersOptions {
  sid: string;
  clientId: string;
  parent?: string;
  limit?: number;
  offset?: number;
  keywords?: string;
}

export async function fetchFolders(options: FetchFoldersOptions) {
  const {
    sid,
    clientId,
    parent = '',
    limit = 50,
    offset = 0,
    keywords = ''
  } = options;

  const url = `${IB_API_BASE_URL}/api/3.0.0/${clientId}/folder.limit(${offset},${limit}).order(createTime)`;
  const params = new URLSearchParams({
    'searchParams[parent]': parent,
    'searchParams[keywords]': keywords,
    productkey: IB_PRODUCT_KEY,
    verbose: 'true'
  });

  const response = await fetch(`${url}?${params}`, {
    headers: {
      'sid': sid,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch folders: ${response.statusText}`);
  }

  return await response.json();
}

interface FetchResourcesOptions {
  sid: string;
  clientId: string;
  folderId?: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
  keywords?: string;
}

export async function fetchResources(options: FetchResourcesOptions) {
  const {
    sid,
    clientId,
    folderId = '',
    resourceId = '',
    limit = 50,
    offset = 0,
    keywords = ''
  } = options;

  const url = `${IB_API_BASE_URL}/api/3.0.0/${clientId}/resource.limit(${offset},${limit}).order(createTime:-1).fields()`;
  const params = new URLSearchParams({
    'searchParams[ib_folder_s]': folderId,
    'searchParams[keywords]': keywords,
    'searchParams[id]': resourceId,
    productkey: IB_PRODUCT_KEY,
    verbose: 'true'
  });

  const response = await fetch(`${url}?${params}`, {
    headers: {
      'sid': sid,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch resources: ${response.statusText}`);
  }

  return await response.json();
}
```

## Resource Change Notifications

### Subscription Support

```typescript
// src/resources/resource-subscriptions.ts
const subscriptions = new Map<string, Set<string>>(); // uri -> Set<sessionId>

server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
  const { uri } = request.params;
  const sessionId = extra.sessionId;

  if (!subscriptions.has(uri)) {
    subscriptions.set(uri, new Set());
  }
  subscriptions.get(uri)!.add(sessionId);

  return {};
});

server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
  const { uri } = request.params;
  const sessionId = extra.sessionId;

  const subs = subscriptions.get(uri);
  if (subs) {
    subs.delete(sessionId);
    if (subs.size === 0) {
      subscriptions.delete(uri);
    }
  }

  return {};
});

// Notify subscribers when resources change
export async function notifyResourceChanged(uri: string) {
  const subs = subscriptions.get(uri);
  if (subs && subs.size > 0) {
    await server.notification({
      method: 'notifications/resources/updated',
      params: { uri }
    });
  }
}
```

## Resource Templates

### Dynamic Resource URIs

```typescript
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return {
    resourceTemplates: [
      {
        uriTemplate: 'ib://{clientid}/folders/{folderId}',
        name: 'IntelligenceBank Folder',
        description: 'Browse folders in IntelligenceBank',
        mimeType: 'application/vnd.intelligencebank.folder'
      },
      {
        uriTemplate: 'ib://{clientid}/resources/{resourceId}',
        name: 'IntelligenceBank Resource',
        description: 'View file metadata from IntelligenceBank',
        mimeType: 'application/json'
      },
      {
        uriTemplate: 'ib://{clientid}/search?q={query}',
        name: 'IntelligenceBank Search',
        description: 'Search for files across IntelligenceBank',
        mimeType: 'application/json'
      }
    ]
  };
});
```

## User Experience Flow

### In Claude Desktop

1. **User clicks "+ / Add action"**
2. **Claude shows "Add from IntelligenceBank" option**
3. **User clicks "Add from IntelligenceBank"**
4. **Resource list loads**:
   - Shows root folders
   - Each folder displays name, description, file count
5. **User clicks a folder**:
   - Resource read request sent
   - Subfolder listing returned
   - User can navigate deeper or view resources
6. **User clicks a resource**:
   - Resource metadata displayed
   - File info, thumbnail, tags, download link
   - Can be referenced in conversation

### Example Claude Interaction

```
User: "Show me the files in the Marketing folder"

Claude: *Uses resource ib://clientid/folders/88d57c098bd010ca0527c4372e56fc9e*
       
       I can see the Marketing Projects folder contains:
       - 4 subfolders
       - Master templates and project-related assets
       - Restricted access (list permission required)

User: "What images are in Stock Photography?"

Claude: *Uses resource ib://clientid/folders/071a19a4dc506a513533e26f3632fa4a/resources*

       The Stock Photography folder contains 36 images including:
       - Multiple tagged images (silhouette, black, etc.)
       - File sizes ranging from 3.66 KB to 582.29 KB
       - Mostly PNG and JPG formats
       - Preview permissions with download approval workflow
```

## Implementation Phases

### Phase 1: Core Resource Support (Week 1)
- [ ] Add resource capability to server initialization
- [ ] Implement basic resource list handler (root folders only)
- [ ] Implement basic resource read handler (folder metadata)
- [ ] Add URI parser utility
- [ ] Test with Claude Desktop

### Phase 2: Full Resource Browsing (Week 2)
- [ ] Implement folder hierarchy navigation
- [ ] Add resource listing within folders
- [ ] Implement search functionality
- [ ] Add pagination support
- [ ] Test complete browsing experience

### Phase 3: Advanced Features (Week 3)
- [ ] Add resource subscriptions
- [ ] Implement resource templates
- [ ] Add thumbnail previews
- [ ] Optimize performance with caching
- [ ] Add comprehensive error handling

### Phase 4: Polish & Documentation (Week 4)
- [ ] Add user documentation
- [ ] Create demo videos
- [ ] Performance testing and optimization
- [ ] Security audit
- [ ] Release to production

## Security Considerations

### 1. Authentication Validation
- **Always** validate session credentials before resource access
- Reject requests without valid `sid`
- Implement token refresh mechanism

### 2. Permission Enforcement
- Respect `allowedActions` from IB API responses
- Filter resources based on user permissions
- Never expose resources user doesn't have access to

### 3. URI Validation
- Validate all URI components
- Prevent path traversal attacks
- Sanitize client input

### 4. Rate Limiting
- Implement request throttling
- Cache frequently accessed resources
- Respect IB API rate limits

### 5. Session Isolation
- Each MCP session is isolated
- No cross-session resource access
- Clear session data on disconnect

## Performance Optimization

### Caching Strategy

```typescript
// src/cache/resource-cache.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ResourceCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttl: number = 300000) { // 5 min default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp) {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

export const resourceCache = new ResourceCache();
```

### Batch Operations

```typescript
// Fetch multiple resources in a single API call
async function fetchMultipleResources(resourceIds: string[], session: Session) {
  const resources = await fetchResources({
    sid: session.credentials.sid,
    clientId: session.credentials.clientId,
    resourceIds: resourceIds.join(','),
    limit: 100
  });

  return resources.rows;
}
```

## Testing Strategy

### Unit Tests
- URI parsing
- Authentication validation
- Cache operations
- Error handling

### Integration Tests
- Full resource browsing flow
- Authentication flow
- API client functions
- Session management

### End-to-End Tests
- Complete user journey in Claude
- Multi-session scenarios
- Error recovery
- Performance under load

## Monitoring & Logging

### Key Metrics
- Resource access frequency
- API response times
- Cache hit rates
- Authentication failures
- Error rates by type

### Logging Strategy
```typescript
logger.info('Resource accessed', {
  uri,
  sessionId,
  duration: Date.now() - startTime,
  cacheHit: false
});

logger.error('Resource access failed', {
  uri,
  sessionId,
  error: error.message,
  stack: error.stack
});
```

## Conclusion

Implementing MCP Resources for IntelligenceBank will provide users with a seamless browsing experience directly within Claude, making it easy to discover and reference files without leaving the conversation. The architecture respects existing authentication patterns, enforces security boundaries, and provides an intuitive interface for navigating the IntelligenceBank file structure.

The phased implementation approach allows for iterative development and testing, ensuring each component works correctly before moving to the next phase. With proper caching and optimization, the system will provide fast, responsive access to IntelligenceBank resources while maintaining security and session isolation.