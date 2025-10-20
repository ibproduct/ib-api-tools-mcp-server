/**
 * OAuth Utility Functions
 * Extracted from index.ts lines 890-916
 * No logic changes - just moved to separate module
 */

export function generateCodeVerifier(): string {
    // Same logic as lines 890-897 in index.ts
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
    // Same logic as lines 899-907 in index.ts
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export function generateState(): string {
    // Same logic as lines 909-916 in index.ts
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}