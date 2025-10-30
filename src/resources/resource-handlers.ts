/**
 * MCP Resource Handlers
 * Simplified implementation for IntelligenceBank Resources List
 */

import type { AuthSession } from '../types/session.types.js';
import type { SessionManager } from '../session/SessionManager.js';
import { parseResourceURI, buildResourceURI } from '../utils/uri-parser.js';
import { fetchResourcesList } from '../api/ib-api-client.js';
import { buildWWWAuthenticateHeader, extractBearerToken } from '../auth/mcp-authorization.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Find authenticated session by Bearer token from Authorization header
 */
function findAuthenticatedSessionByToken(
    sessionManager: SessionManager,
    authHeader: string | undefined
): AuthSession | null {
    const token = extractBearerToken(authHeader);
    if (!token) {
        return null;
    }
    
    const allSessions = (sessionManager as any).authSessions as Map<string, AuthSession>;
    
    for (const session of allSessions.values()) {
        if (session.tokens?.accessToken === token &&
            session.status === 'completed' &&
            session.ibSession?.sid) {
            const now = Date.now();
            if (!session.ibSession.sidExpiry || session.ibSession.sidExpiry > now) {
                return session;
            }
        }
    }
    
    return null;
}

/**
 * Create a 401 Unauthorized error with WWW-Authenticate header
 */
function createAuthenticationError(realm: string): never {
    const wwwAuthenticate = buildWWWAuthenticateHeader({
        realm,
        scope: 'read write',
        error: 'invalid_token',
        errorDescription: 'Authentication required to access IntelligenceBank resources'
    });
    
    const error = new McpError(
        ErrorCode.InvalidRequest,
        'Authentication required',
        {
            'WWW-Authenticate': wwwAuthenticate
        }
    );
    
    throw error;
}

/**
 * Parse cursor to extract offset and keywords
 */
function parseCursor(cursor?: string): { offset: number; keywords: string } {
    if (!cursor) {
        return { offset: 0, keywords: '' };
    }
    
    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        return {
            offset: decoded.offset || 0,
            keywords: decoded.keywords || ''
        };
    } catch {
        return { offset: 0, keywords: '' };
    }
}

/**
 * Build cursor with offset and keywords
 */
function buildCursor(offset: number, keywords: string): string {
    const data = { offset, keywords };
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromFileType(fileType: string): string {
    const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'zip': 'application/zip',
        'txt': 'text/plain'
    };
    
    return mimeTypes[fileType.toLowerCase()] || 'application/octet-stream';
}

/**
 * List resources - returns all resources with optional keyword filtering
 */
export async function handleResourceList(
    sessionManager: SessionManager,
    sessionId: string,
    cursor?: string,
    authHeader?: string
): Promise<{ resources: any[]; nextCursor?: string }> {
    console.log('[handleResourceList] Request received:', {
        hasAuthHeader: !!authHeader,
        authHeaderPreview: authHeader?.substring(0, 30) + '...',
        sessionId,
        cursor
    });
    
    // Find authenticated session by Bearer token
    const session = findAuthenticatedSessionByToken(sessionManager, authHeader);
    
    console.log('[handleResourceList] Session lookup result:', {
        sessionFound: !!session,
        hasIBSession: !!session?.ibSession,
        hasSid: !!session?.ibSession?.sid,
        sessionStatus: session?.status
    });
    
    // Return 401 with WWW-Authenticate header if not authenticated
    if (!session?.ibSession?.sid) {
        console.log('[handleResourceList] Authentication failed - returning 401');
        const realm = process.env.MCP_SERVER_URL || 'http://localhost:3000';
        createAuthenticationError(realm);
    }

    const { sid, clientId, apiV3url } = session.ibSession;
    
    console.log('[handleResourceList] Using credentials:', {
        clientId,
        sidPreview: sid.substring(0, 8) + '...',
        apiV3url
    });
    
    // Parse cursor to get offset and keywords
    const { offset, keywords } = parseCursor(cursor);
    
    console.log('[handleResourceList] Query parameters:', { offset, keywords, limit: 100 });

    try {
        console.log('[handleResourceList] Fetching resources from IB API...');
        
        // Fetch resources list
        const resourcesResponse = await fetchResourcesList({
            sid,
            clientId,
            apiV3url,
            keywords,
            limit: 100,
            offset
        });

        console.log('[handleResourceList] API response received:', {
            totalCount: resourcesResponse.response.count,
            rowsReturned: resourcesResponse.response.rows.length,
            hasMore: offset + resourcesResponse.response.rows.length < resourcesResponse.response.count
        });

        // Convert to MCP resource format
        const resources = resourcesResponse.response.rows.map(resource => ({
            uri: buildResourceURI(clientId, 'resource', resource._id),
            name: resource.name,
            description: `${resource.fancyFileType} - ${resource.fancyFileSize} - Updated: ${new Date(resource.lastUpdateTime).toLocaleDateString()}`,
            mimeType: getMimeTypeFromFileType(resource.file.type),
            annotations: {
                audience: ['user', 'assistant'],
                priority: 0.5,
                lastModified: resource.lastUpdateTime
            }
        }));

        const hasMore = offset + resourcesResponse.response.rows.length < resourcesResponse.response.count;
        
        console.log('[handleResourceList] Returning response:', {
            resourceCount: resources.length,
            hasNextCursor: hasMore
        });
        
        return {
            resources,
            nextCursor: hasMore ? buildCursor(offset + 100, keywords) : undefined
        };
    } catch (error) {
        console.error('[handleResourceList] Error listing resources:', error);
        if (error instanceof Error) {
            console.error('[handleResourceList] Error stack:', error.stack);
        }
        throw new Error(`Failed to list resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Read a resource - returns detailed resource metadata
 */
export async function handleResourceRead(
    sessionManager: SessionManager,
    sessionId: string,
    uri: string,
    authHeader?: string
): Promise<{ contents: any[] }> {
    // Find authenticated session by Bearer token
    const session = findAuthenticatedSessionByToken(sessionManager, authHeader);
    
    // Return 401 with WWW-Authenticate header if not authenticated
    if (!session?.ibSession?.sid) {
        const realm = process.env.MCP_SERVER_URL || 'http://localhost:3000';
        createAuthenticationError(realm);
    }

    const parsed = parseResourceURI(uri);
    
    if (parsed.type !== 'resource') {
        throw new Error(`Invalid resource URI: ${uri}`);
    }

    const { sid, clientId, apiV3url } = session.ibSession;

    try {
        // Fetch all resources to find the specific one by ID
        // Note: This is not optimal but works for the simplified version
        // In the future, we could add a specific resource fetch endpoint
        const resourcesResponse = await fetchResourcesList({
            sid,
            clientId,
            apiV3url,
            limit: 1000,
            offset: 0
        });

        const resource = resourcesResponse.response.rows.find(r => r._id === parsed.resourceId);
        
        if (!resource) {
            throw new Error('Resource not found');
        }

        // Return detailed resource information
        const content = {
            type: 'resource',
            id: resource._id,
            name: resource.name,
            fileType: resource.file.type,
            fileSize: resource.fancyFileSize,
            fileSizeBytes: resource.file.size,
            thumbnail: resource.thumbnail,
            tags: resource.tags,
            folderPath: resource.folderPath,
            downloadUrl: `https://${clientId}.intelligencebank.com/download/${resource._id}`,
            metadata: {
                created: resource.createTime,
                updated: resource.lastUpdateTime,
                creator: resource.creatorName,
                dimensions: resource.imageWidth && resource.imageHeight
                    ? `${resource.imageWidth}x${resource.imageHeight}`
                    : undefined,
                hash: resource.file.hash
            },
            allowedActions: resource.allowedActions
        };

        return {
            contents: [
                {
                    uri: `ib://${parsed.clientId}/resource/${parsed.resourceId}`,
                    mimeType: 'application/json',
                    text: JSON.stringify(content, null, 2)
                }
            ]
        };
    } catch (error) {
        console.error('Error reading resource:', error);
        throw new Error(`Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}