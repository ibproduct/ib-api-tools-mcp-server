/**
 * Run File Compliance Review Tool
 * 
 * Comprehensive outcome-based tool that handles the complete file compliance review workflow:
 * 1. Upload file to IntelligenceBank
 * 2. Create compliance review with optional category filters
 * 3. Poll review status until completion
 * 4. Return formatted results with compliance findings
 */

import { z } from 'zod';
import { SessionManager } from '../session/SessionManager.js';
import type {
    FileInput,
    ComplianceCategorization,
    FileUploadResponse,
    ComplianceReviewCreateResponse,
    ComplianceReviewStatusResponse,
    ComplianceReviewResult,
    FormattedComplianceComment
} from '../types/compliance-review.types.js';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { getUploadedFile, cleanupUploadedFile } from '../server/upload-handler.js';

export class RunFileComplianceReviewTool {
    public readonly definition = {
        name: 'run_file_compliance_review',
        title: 'Run File Compliance Review',
        description: `STEP 2 of 2: Run complete file compliance review workflow after uploading file.

⚠️ PREREQUISITE: Must call upload_file FIRST to get fileId ⚠️

MANDATORY SEQUENCE:
1. Call upload_file with the file → Get fileId
2. Call this tool with the fileId (you are here)

DO NOT call this tool with:
- Local file paths (will fail with 400 Bad Request)
- Base64 content (will consume excessive context tokens)

CORRECT INPUT FORMAT:
{
  "sessionId": "session-id-from-browser-login",
  "file": { "fileId": "upload-abc123..." },  ← Use fileId from upload_file
  "categorization": [...]  ← Optional category filters
}

WHAT THIS TOOL DOES AUTOMATICALLY:
1. Retrieves the uploaded file from temporary storage (using fileId)
2. Uploads the file to IntelligenceBank
3. Creates a compliance review with optional category filters
4. Automatically polls for completion (typically 2-3 minutes)
5. Returns formatted results with all compliance findings
6. Cleans up the temporary file

CATEGORIZATION (OPTIONAL - STEP 0):
Before calling upload_file, optionally call get_compliance_filters to see available category options.
Category filters provide context that determines which brand rules apply. Format:
[
  { "categoryName": "Channel", "selectedOptions": ["Digital", "Print"] },
  { "categoryName": "Market", "selectedOptions": ["APAC"] }
]
Values must exactly match those returned by get_compliance_filters (case-sensitive).

COMPLETE WORKFLOW EXAMPLE:
Step 0 (optional): get_compliance_filters({ sessionId: "..." })
                   → See available filters like "Channel", "Market"
Step 1 (required): upload_file({ file: "/path/to/doc.pdf" })
                   → Returns: { fileId: "upload-abc123..." }
Step 2 (required): run_file_compliance_review({
                     sessionId: "...",
                     file: { fileId: "upload-abc123..." },
                     categorization: [{ categoryName: "Channel", selectedOptions: ["Digital"] }]
                   })
                   → Returns: Review results with compliance findings

RETURNS:
- reviewId: Unique identifier for the review
- status: "completed", "pending", "error", or "failed"
- summary: Overview with total issues and breakdowns by rule and page
- comments: Detailed array of each compliance finding with:
  * term: The specific text that triggered the issue
  * explanation: Description of the compliance concern
  * sentence: Full sentence containing the issue
  * ruleName: Internal rule identifier (e.g., "02-IB-DISCLAIMER")
  * ruleDescription: User-friendly rule name (e.g., "Financial Product Disclaimer")
  * page: Page number where issue was found
  * feedback: Additional guidance on how to resolve (if available)

HOW TO PRESENT RESULTS TO USER:
1. Start with the summary: "Found X compliance issues across Y rules on Z pages"
2. Group issues by rule or page for easier understanding
3. For each issue, show:
   - The rule that was triggered (ruleDescription)
   - The problematic text (term in context of sentence)
   - The explanation and any feedback provided
   - The page location
4. If no issues found, clearly state "No compliance issues detected"

TIMING:
The tool waits up to 5 minutes by default (configurable via maxWaitTime). Reviews typically complete in 2-3 minutes. If it times out, the review continues processing and can be checked later via the reviewId.`,
        inputSchema: {
            sessionId: z.string().describe('Session ID from successful authentication'),
            file: z.union([
                z.object({
                    fileId: z.string().describe('File ID from upload endpoint - REQUIRED for remote server. Upload file first, then provide the fileId.')
                }),
                z.string().describe('File path - LEGACY ONLY, will fail on remote deployments'),
                z.object({
                    path: z.string().describe('File path - LEGACY ONLY, will fail on remote deployments')
                }),
                z.object({
                    content: z.string().describe('Base64 content - NOT RECOMMENDED: consumes excessive context tokens'),
                    filename: z.string().describe('Filename')
                })
            ]).describe('File to review. MUST use fileId from upload endpoint for remote server.'),
            categorization: z.array(z.object({
                categoryName: z.string().describe('Category filter name (e.g., "Channel", "Market")'),
                selectedOptions: z.array(z.string()).describe('Selected values for this category (must match exact values from get_compliance_filters)')
            })).optional().describe('Optional category filters to apply. Use get_compliance_filters to see available options.'),
            maxWaitTime: z.number().optional().default(300).describe('Maximum time to wait for review completion in seconds (default: 300)'),
            pollInterval: z.number().optional().default(5).describe('How often to check review status in seconds (default: 5)')
        },
        outputSchema: {
            success: z.boolean(),
            reviewId: z.string(),
            filename: z.string(),
            processingTime: z.number(),
            status: z.enum(['pending', 'completed', 'error', 'failed']),
            categorization: z.array(z.any()),
            totalTriggers: z.number().optional(),
            triggeredRules: z.number().optional(),
            comments: z.array(z.any()).optional(),
            summary: z.object({
                totalIssues: z.number(),
                issuesByRule: z.record(z.number()),
                issuesByPage: z.record(z.number())
            }).optional(),
            error: z.string().optional(),
            message: z.string().optional()
        }
    };

    constructor(private sessionManager: SessionManager) {}

    async execute(input: {
        sessionId: string;
        file: FileInput;
        categorization?: ComplianceCategorization[];
        maxWaitTime?: number;
        pollInterval?: number;
    }) {
        const result = await this.executeReview(input);
        
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }],
            structuredContent: result
        };
    }

    private async executeReview(input: {
        sessionId: string;
        file: FileInput;
        categorization?: ComplianceCategorization[];
        maxWaitTime?: number;
        pollInterval?: number;
    }): Promise<ComplianceReviewResult> {
        const startTime = Date.now();
        const maxWaitTime = (input.maxWaitTime || 300) * 1000;
        const pollInterval = (input.pollInterval || 5) * 1000;

        try {
            // Retrieve session
            const session = this.sessionManager.getSession(input.sessionId);
            if (!session?.ibSession) {
                return {
                    success: false,
                    reviewId: '',
                    filename: '',
                    processingTime: 0,
                    status: 'error',
                    categorization: [],
                    error: 'No active IntelligenceBank session found. Please authenticate first using browser_login.'
                };
            }

            const { sid, clientId, apiV3url } = session.ibSession;
            const productkey = process.env.IB_PRODUCT_KEY || '';

            // Step 1: Get file information
            const fileInfo = await this.getFileInfo(input.file);

            // Step 2: Upload file
            const uploadResult = await this.uploadFile(fileInfo, apiV3url, clientId, sid, productkey);
            if (!uploadResult.success || !uploadResult.fileHash) {
                return {
                    success: false,
                    reviewId: '',
                    filename: fileInfo.filename,
                    processingTime: (Date.now() - startTime) / 1000,
                    status: 'error',
                    categorization: input.categorization || [],
                    error: uploadResult.error || 'File upload failed'
                };
            }

            // Step 3: Create compliance review
            const createResult = await this.createComplianceReview(
                uploadResult.fileHash,
                fileInfo.filename,
                input.categorization || [],
                apiV3url,
                clientId,
                sid,
                productkey
            );

            if (!createResult.success || !createResult.reviewId) {
                return {
                    success: false,
                    reviewId: '',
                    filename: fileInfo.filename,
                    processingTime: (Date.now() - startTime) / 1000,
                    status: 'error',
                    categorization: input.categorization || [],
                    error: createResult.error || 'Review creation failed'
                };
            }

            // Step 4: Poll for completion
            let reviewData: ComplianceReviewStatusResponse['response']['data'] | null = null;
            let pollCount = 0;

            while (Date.now() - startTime < maxWaitTime) {
                pollCount++;
                
                try {
                    reviewData = await this.checkReviewStatus(
                        createResult.reviewId,
                        apiV3url,
                        clientId,
                        sid,
                        productkey
                    );

                    if (reviewData.status === 'completed') {
                        break;
                    }

                    if (reviewData.status === 'error' || reviewData.status === 'failed') {
                        return {
                            success: false,
                            reviewId: createResult.reviewId,
                            filename: fileInfo.filename,
                            processingTime: (Date.now() - startTime) / 1000,
                            status: reviewData.status,
                            categorization: input.categorization || [],
                            error: reviewData.errorMessage || reviewData.error || `Review ${reviewData.status}`,
                            message: `Review failed after ${pollCount} status checks`
                        };
                    }

                    // Wait before next poll
                    await new Promise(resolve => setTimeout(resolve, pollInterval));

                } catch (error) {
                    return {
                        success: false,
                        reviewId: createResult.reviewId,
                        filename: fileInfo.filename,
                        processingTime: (Date.now() - startTime) / 1000,
                        status: 'error',
                        categorization: input.categorization || [],
                        error: error instanceof Error ? error.message : 'Error checking review status'
                    };
                }
            }

            // Check if we timed out
            if (!reviewData || reviewData.status !== 'completed') {
                return {
                    success: false,
                    reviewId: createResult.reviewId,
                    filename: fileInfo.filename,
                    processingTime: (Date.now() - startTime) / 1000,
                    status: reviewData?.status || 'pending',
                    categorization: input.categorization || [],
                    error: `Review did not complete within ${input.maxWaitTime || 300} seconds (${pollCount} checks)`,
                    message: 'Consider increasing maxWaitTime or check review status manually'
                };
            }

            // Step 5: Cleanup uploaded file if using fileId
            if (fileInfo.fileId) {
                await cleanupUploadedFile(fileInfo.fileId);
            }

            // Step 6: Format and return results
            const formattedComments = this.formatComments(reviewData.comments);
            const summary = this.generateSummary(formattedComments);

            return {
                success: true,
                reviewId: createResult.reviewId,
                filename: fileInfo.filename,
                processingTime: (Date.now() - startTime) / 1000,
                status: 'completed',
                categorization: reviewData.categorisation || input.categorization || [],
                totalTriggers: reviewData.totalTriggerNum,
                triggeredRules: reviewData.triggeredRuleNum,
                comments: formattedComments,
                summary,
                message: `Review completed successfully with ${formattedComments.length} findings after ${pollCount} status checks`
            };

        } catch (error) {
            return {
                success: false,
                reviewId: '',
                filename: '',
                processingTime: (Date.now() - startTime) / 1000,
                status: 'error',
                categorization: input.categorization || [],
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    private async getFileInfo(file: FileInput): Promise<{ path?: string; content?: Buffer; filename: string; fileId?: string }> {
        // Handle fileId (recommended approach)
        if (typeof file === 'object' && 'fileId' in file && typeof file.fileId === 'string') {
            const uploadedFile = await getUploadedFile(file.fileId);
            if (!uploadedFile) {
                throw new Error(`File not found or expired: ${file.fileId}`);
            }
            return {
                path: uploadedFile.path,
                filename: uploadedFile.filename,
                fileId: file.fileId
            };
        }
        
        // Legacy path handling
        if (typeof file === 'string') {
            return { path: file, filename: path.basename(file) };
        }
        
        if ('path' in file) {
            return { path: file.path, filename: path.basename(file.path) };
        }
        
        // Base64 content (discouraged)
        if ('content' in file && 'filename' in file) {
            const content = Buffer.from(file.content, 'base64');
            return { content, filename: file.filename };
        }
        
        throw new Error('Invalid file input format');
    }

    private async uploadFile(
        fileInfo: { path?: string; content?: Buffer; filename: string; fileId?: string },
        apiV3url: string,
        clientId: string,
        sid: string,
        productkey: string
    ): Promise<{ success: boolean; fileHash?: string; error?: string }> {
        try {
            const form = new FormData();
            
            if (fileInfo.path) {
                form.append('file', fs.createReadStream(fileInfo.path));
            } else if (fileInfo.content) {
                form.append('file', fileInfo.content, { filename: fileInfo.filename });
            } else {
                return { success: false, error: 'No file content or path provided' };
            }

            const url = `${apiV3url}/api/3.0.0/${clientId}/file?target=complianceReview&productkey=${productkey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'sid': sid,
                    ...form.getHeaders()
                },
                body: form as any
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: `File upload failed with status ${response.status}: ${response.statusText}`
                };
            }

            const data = await response.json() as FileUploadResponse;
            
            if (data.response.error !== 0) {
                return {
                    success: false,
                    error: `File upload error code: ${data.response.error}`
                };
            }

            return {
                success: true,
                fileHash: data.response._id
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during file upload'
            };
        }
    }

    private async createComplianceReview(
        fileHash: string,
        filename: string,
        categorization: ComplianceCategorization[],
        apiV3url: string,
        clientId: string,
        sid: string,
        productkey: string
    ): Promise<{ success: boolean; reviewId?: string; error?: string }> {
        try {
            const url = `${apiV3url}/api/3.0.0/${clientId}/complianceReview?complianceReviewType=file&productkey=${productkey}`;
            
            const body = {
                data: {
                    fileHash,
                    documentId: filename,
                    categorisation: categorization
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'sid': sid,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: `Create review failed with status ${response.status}: ${response.statusText}`
                };
            }

            const data = await response.json() as ComplianceReviewCreateResponse;

            return {
                success: true,
                reviewId: data.response.data._id
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error creating compliance review'
            };
        }
    }

    private async checkReviewStatus(
        reviewId: string,
        apiV3url: string,
        clientId: string,
        sid: string,
        productkey: string
    ): Promise<ComplianceReviewStatusResponse['response']['data']> {
        const url = `${apiV3url}/api/3.0.0/${clientId}/complianceReview/${reviewId}?includeComments=true&productkey=${productkey}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'sid': sid,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Status check failed with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as ComplianceReviewStatusResponse;
        return data.response.data;
    }

    private formatComments(comments: ComplianceReviewStatusResponse['response']['data']['comments']): FormattedComplianceComment[] {
        if (!comments || comments.length === 0) {
            return [];
        }

        return comments.map(comment => ({
            id: comment.id,
            term: comment.compCheckTerm,
            explanation: comment.compCheckExplanation,
            sentence: comment.compCheckSentence,
            sentenceStart: comment.compCheckSentenceStart,
            termStart: comment.compCheckTermStart,
            ruleName: comment.ruleName,
            ruleDescription: comment.ruleDescription,
            feedback: comment.compCheckFeedback,
            page: comment.compCheckSortPage,
            position: {
                x: comment.annotationInfo.x,
                y: comment.annotationInfo.y
            },
            status: comment.compCheckStatus,
            resolved: comment.resolved
        }));
    }

    private generateSummary(comments: FormattedComplianceComment[]) {
        const issuesByRule: Record<string, number> = {};
        const issuesByPage: Record<number, number> = {};

        for (const comment of comments) {
            const ruleKey = `${comment.ruleName} (${comment.ruleDescription})`;
            issuesByRule[ruleKey] = (issuesByRule[ruleKey] || 0) + 1;
            issuesByPage[comment.page] = (issuesByPage[comment.page] || 0) + 1;
        }

        return {
            totalIssues: comments.length,
            issuesByRule,
            issuesByPage
        };
    }
}