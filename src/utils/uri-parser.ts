/**
 * URI Parser for IntelligenceBank Resources
 * Simplified to only handle resource URIs
 */

export interface ResourceURI {
    clientId: string;
    type: 'resource';
    resourceId: string;
}

/**
 * Parse IntelligenceBank resource URI
 * Format: ib://{clientId}/resource/{resourceId}
 */
export function parseResourceURI(uri: string): ResourceURI {
    const match = uri.match(/^ib:\/\/([^\/]+)\/resource\/([^\/]+)$/);
    
    if (!match) {
        throw new Error(`Invalid resource URI format: ${uri}. Expected: ib://{clientId}/resource/{resourceId}`);
    }
    
    return {
        clientId: match[1],
        type: 'resource',
        resourceId: match[2]
    };
}

/**
 * Build IntelligenceBank resource URI
 */
export function buildResourceURI(
    clientId: string,
    type: 'resource',
    resourceId: string
): string {
    return `ib://${clientId}/resource/${resourceId}`;
}