/**
 * Get Compliance Filters Tool
 * 
 * Fetches available category filters for compliance reviews from IntelligenceBank API.
 * These filters are used when creating a compliance review to specify context like
 * Channel, Market, Region, etc.
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';
import type { ComplianceFilter } from '../types/compliance-review.types.js';

export class GetComplianceFiltersTool {
    public readonly definition = {
        name: 'get_compliance_filters',
        title: 'Get Compliance Filters',
        description: `OPTIONAL STEP 0: Get available category filters for compliance reviews.

WHEN TO USE:
Call this tool when user wants to see categorization options before running a review. This is OPTIONAL - users can skip directly to file upload and review.

WORKFLOW POSITION:
Step 0 (optional): get_compliance_filters → See available filters
Step 1 (required): upload_file → Get fileId
Step 2 (required): run_file_compliance_review → Run review with optional filters

WHAT IT RETURNS:
Category filters (e.g., "Channel", "Market", "Region") with their available values:
- name: Category name (e.g., "Channel", "Market")
- values: Selectable options with exact text (case-sensitive)
- required: Whether this filter must be provided
- multiple: Whether multiple values can be selected

HOW TO USE RESULTS:
1. Present filters to user: "Available filters: Channel (Digital, Print, Social), Market (APAC, EMEA, Americas)"
2. User chooses filters (if any)
3. Pass to run_file_compliance_review as categorization parameter

EXAMPLE:
get_compliance_filters() → Returns filters
User chooses: Channel=Digital, Market=APAC
run_file_compliance_review({
  categorization: [
    { categoryName: "Channel", selectedOptions: ["Digital"] },
    { categoryName: "Market", selectedOptions: ["APAC"] }
  ]
})`,
        inputSchema: {
            sessionId: z.string().describe('Session ID from successful authentication')
        },
        outputSchema: {
            success: z.boolean(),
            filters: z.array(z.object({
                id: z.string(),
                name: z.string(),
                required: z.boolean(),
                multiple: z.boolean(),
                values: z.array(z.object({
                    uuid: z.string(),
                    value: z.string()
                }))
            })).optional(),
            error: z.string().optional()
        }
    };

    constructor(private sessionManager: SessionManager) {}

    async execute({ sessionId }: { sessionId: string }) {
        try {
            // Retrieve session
            const session = this.sessionManager.getSession(sessionId);
            if (!session?.ibSession) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: 'No active IntelligenceBank session found. Please authenticate first using browser_login.'
                        }, null, 2)
                    }],
                    structuredContent: {
                        success: false,
                        error: 'No active IntelligenceBank session found. Please authenticate first using browser_login.'
                    }
                };
            }

            const { sid, clientId, apiV3url } = session.ibSession;
            const productkey = process.env.IB_PRODUCT_KEY || '';

            // Construct API URL
            const url = `${apiV3url}/api/3.0.0/${clientId}/filter.limit(100)?searchParams[enableAutoReviews]=true&action=input&productkey=${productkey}`;

            // Make API request
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'sid': sid,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: `API request failed with status ${response.status}: ${response.statusText}`
                        }, null, 2)
                    }],
                    structuredContent: {
                        success: false,
                        error: `API request failed with status ${response.status}: ${response.statusText}`
                    }
                };
            }

            const data = await response.json() as {
                response: {
                    count: number;
                    offset: number;
                    rows: ComplianceFilter[];
                };
            };

            // Transform to user-friendly format
            const filters = data.response.rows.map(filter => ({
                id: filter._id,
                name: filter.name,
                required: filter.required === '1' || filter.required === true,
                multiple: filter.multiple === '1' || filter.multiple === true,
                values: filter.filterValues.map(fv => ({
                    uuid: fv.uuid,
                    value: fv.value
                }))
            }));

            const output = {
                success: true,
                filters
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
                    text: JSON.stringify({
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error occurred'
                    }, null, 2)
                }],
                structuredContent: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error occurred'
                }
            };
        }
    }
}