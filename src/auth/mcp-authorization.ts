/**
 * MCP Authorization Protocol Implementation
 * 
 * Implements RFC9728 (OAuth 2.0 Protected Resource Metadata) and 
 * RFC8414 (OAuth 2.0 Authorization Server Metadata) endpoints
 * required by the MCP Authorization specification.
 * 
 * These endpoints enable automatic OAuth flow initiation in MCP clients
 * like Claude Desktop when resources require authentication.
 */

import { Request, Response } from 'express';

/**
 * Get the MCP server base URL from environment or construct from request
 */
function getServerUrl(req: Request): string {
    // Use environment variable if set (for production)
    if (process.env.MCP_SERVER_URL) {
        return process.env.MCP_SERVER_URL;
    }
    
    // Construct from request (for development)
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}`;
}

/**
 * Get the OAuth bridge base URL from environment
 * Removes trailing slash for consistency
 */
function getOAuthBridgeUrl(): string {
    const bridgeUrl = process.env.OAUTH_BRIDGE_URL;
    if (!bridgeUrl) {
        throw new Error('OAUTH_BRIDGE_URL environment variable is required');
    }
    // Remove trailing slash for consistency with RFC8414
    return bridgeUrl.replace(/\/$/, '');
}

/**
 * Protected Resource Metadata Endpoint
 * RFC9728: https://datatracker.ietf.org/doc/html/rfc9728
 * 
 * This endpoint describes the OAuth 2.0 authorization requirements
 * for accessing protected resources on this server.
 */
export function handleProtectedResourceMetadata(req: Request, res: Response): void {
    try {
        const serverUrl = getServerUrl(req);
        
        const metadata = {
            // Resource server identifier
            resource: serverUrl,
            
            // Authorization servers that can issue tokens for this resource
            // Point to our own server which proxies the OAuth bridge
            // This avoids path-component discovery issues
            authorization_servers: [serverUrl],
            
            // Scopes required to access resources - MUST match OAuth bridge scopes
            scopes_supported: ['profile'],
            
            // Bearer token usage
            bearer_methods_supported: ['header'],
            
            // Resource server endpoints
            resource_documentation: `${serverUrl}/docs`,
            
            // Additional metadata
            resource_signing_alg_values_supported: ['RS256']
        };
        
        res.json(metadata);
    } catch (error) {
        console.error('Error generating protected resource metadata:', error);
        res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to generate protected resource metadata'
        });
    }
}

/**
 * Authorization Server Metadata Endpoint
 * RFC8414: https://datatracker.ietf.org/doc/html/rfc8414
 * 
 * This endpoint describes the OAuth 2.0 authorization server's
 * capabilities and endpoints. We point to the IntelligenceBank
 * OAuth bridge for actual authorization.
 */
export function handleAuthorizationServerMetadata(req: Request, res: Response): void {
    try {
        const bridgeUrl = getOAuthBridgeUrl();
        const serverUrl = getServerUrl(req);
        
        // Proxy the OAuth bridge metadata but use our server URL as the issuer
        // This avoids path-component discovery issues since our issuer has no path
        const metadata = {
            // Use MCP server URL as issuer (no path component = simpler discovery)
            issuer: serverUrl,
            
            // Authorization endpoint (OAuth bridge)
            authorization_endpoint: `${bridgeUrl}/authorize`,
            
            // Token endpoint (OAuth bridge)
            token_endpoint: `${bridgeUrl}/token`,
            
            // Registration endpoint for dynamic client registration
            // This allows Claude to register itself with its own redirect_uri
            registration_endpoint: `${bridgeUrl}/register`,
            
            // Supported grant types - match OAuth bridge capabilities
            grant_types_supported: ['authorization_code', 'refresh_token'],
            
            // Supported response types
            response_types_supported: ['code'],
            
            // Supported scopes - MUST match OAuth bridge scopes
            scopes_supported: ['profile'],
            
            // Token endpoint authentication methods (public client with PKCE)
            token_endpoint_auth_methods_supported: ['none'],
            
            // PKCE support (required for public clients)
            code_challenge_methods_supported: ['S256'],
            
            // Response modes
            response_modes_supported: ['query'],
            
            // Additional metadata
            service_documentation: `${serverUrl}/docs`
        };
        
        res.json(metadata);
    } catch (error) {
        console.error('Error generating authorization server metadata:', error);
        res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to generate authorization server metadata'
        });
    }
}

/**
 * WWW-Authenticate Header Builder
 * 
 * Constructs the WWW-Authenticate header value for 401 responses
 * per RFC6750 (OAuth 2.0 Bearer Token Usage).
 * 
 * @param realm - The protection realm (typically the server URL)
 * @param scope - Optional scope required for the resource
 * @param error - Optional error code
 * @param errorDescription - Optional error description
 */
export function buildWWWAuthenticateHeader(params: {
    realm: string;
    scope?: string;
    error?: string;
    errorDescription?: string;
    resource_metadata?: string;
}): string {
    const parts: string[] = [`Bearer realm="${params.realm}"`];
    
    // Add resource_metadata for OAuth discovery (CRITICAL for automatic OAuth flow)
    if (params.resource_metadata) {
        parts.push(`resource_metadata="${params.resource_metadata}"`);
    }
    
    if (params.scope) {
        parts.push(`scope="${params.scope}"`);
    }
    
    if (params.error) {
        parts.push(`error="${params.error}"`);
    }
    
    if (params.errorDescription) {
        parts.push(`error_description="${params.errorDescription}"`);
    }
    
    return parts.join(', ');
}

/**
 * Extract Bearer Token from Authorization Header
 * 
 * Parses the Authorization header and extracts the Bearer token.
 * Returns null if no valid Bearer token is found.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
        return null;
    }
    
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}