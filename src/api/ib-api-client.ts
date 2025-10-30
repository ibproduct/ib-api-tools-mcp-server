/**
 * IntelligenceBank API Client
 * Simplified to only fetch resources list
 */

import type { IBResourceResponse } from '../types/resource.types.js';

const IB_PRODUCT_KEY = '0D1DBC845CB94841B71E7E1E64D347A2';

/**
 * Fetch resources list from IntelligenceBank API
 * Returns all resources with optional keyword search
 *
 * @param sid - IntelligenceBank session ID (from OAuth bridge /userinfo)
 * @param clientId - IB client identifier (e.g., "vvVq", "BnK4JV")
 * @param apiV3url - Full base URL for IB API (e.g., "https://auprod2auv3.intelligencebank.com")
 */
export async function fetchResourcesList(options: {
    sid: string;
    clientId: string;
    apiV3url: string;
    keywords?: string;
    limit?: number;
    offset?: number;
}): Promise<IBResourceResponse> {
    const {
        sid,
        clientId,
        apiV3url,
        keywords = '',
        limit = 100,
        offset = 0
    } = options;

    const url = `${apiV3url}/api/3.0.0/${clientId}/resource.limit(${offset},${limit}).order(lastUpdateTime:-1).includeAmaTags(brands,locations,topics,objects,landmarks,keywords,faces)`;
    
    const params = new URLSearchParams({
        'searchParams[isSearching]': 'true',
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
        throw new Error(`Failed to fetch resources list: ${response.statusText}`);
    }

    return await response.json();
}