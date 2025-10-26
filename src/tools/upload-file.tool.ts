/**
 * Upload File Tool
 * 
 * MCP tool that uploads files to the server's temporary storage for use in compliance reviews.
 * This solves the remote server file access issue by providing an MCP-compatible upload mechanism.
 */

import { z } from 'zod';
import { getUploadedFile } from '../server/upload-handler.js';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

export class UploadFileTool {
    public readonly definition = {
        name: 'upload_file',
        title: 'Upload File to Server',
        description: `STEP 1 of 2: Upload file to server's temporary storage before running compliance review.

⚠️ REQUIRED FIRST STEP FOR FILE COMPLIANCE REVIEWS ⚠️

CRITICAL: This is a REMOTE MCP server. You must provide the file content directly in the tool call.

MANDATORY WORKFLOW:
1. User provides a file for compliance review
2. Read the file and encode as base64 (this happens IN THE TOOL CALL, not in conversation)
3. → Call upload_file with base64 content (THIS TOOL)
4. → Receive fileId in response
5. → Call run_file_compliance_review with the fileId

HOW TO USE:
When user provides a file at "/path/to/document.pdf", you MUST:
1. Read the file (using your file reading capabilities)
2. Encode to base64
3. Pass DIRECTLY to this tool as: { file: { content: "base64data", filename: "document.pdf" } }

DO NOT:
- Pass file paths (server cannot access client filesystem)
- Show base64 content in conversation (wastes context tokens)
- Skip this step and go directly to run_file_compliance_review

REQUIRED INPUT FORMAT:
{
  "file": {
    "content": "<base64-encoded file content>",
    "filename": "original-filename.pdf"
  }
}

RETURNS:
- fileId: Use this in run_file_compliance_review (step 2)
- filename: Original filename
- size: File size in bytes
- expiresAt: File expires after 5 minutes or when used

EXAMPLE WORKFLOW:
User: "Review this file: /path/to/doc.pdf"
Step 1: Read /path/to/doc.pdf and encode to base64
Step 2: Call upload_file({ file: { content: "<base64>", filename: "doc.pdf" } })
        → Returns: { fileId: "upload-abc123..." }
Step 3: Call run_file_compliance_review({ sessionId: "...", file: { fileId: "upload-abc123..." } })
        → Returns: Compliance review results`,
        inputSchema: {
            file: z.union([
                z.string().describe('File path to upload'),
                z.object({
                    path: z.string().describe('File path to upload')
                }),
                z.object({
                    content: z.string().describe('Base64 encoded file content'),
                    filename: z.string().describe('Original filename with extension')
                })
            ]).describe('File to upload - can be a path or base64 content')
        },
        outputSchema: {
            success: z.boolean(),
            fileId: z.string().optional(),
            filename: z.string().optional(),
            size: z.number().optional(),
            expiresAt: z.number().optional(),
            message: z.string().optional(),
            error: z.string().optional()
        }
    };

    async execute(input: {
        file: string | { path: string } | { content: string; filename: string };
    }) {
        const result = await this.uploadFile(input.file);
        
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }],
            structuredContent: result
        };
    }

    private async uploadFile(file: any): Promise<{
        success: boolean;
        fileId?: string;
        filename?: string;
        size?: number;
        expiresAt?: number;
        message?: string;
        error?: string;
    }> {
        try {
            // Get file information
            const fileInfo = this.getFileInfo(file);
            
            // Create form data for internal upload
            const form = new FormData();
            
            if (fileInfo.path) {
                // Upload from file path
                form.append('file', fs.createReadStream(fileInfo.path));
            } else if (fileInfo.content) {
                // Upload from buffer
                form.append('file', fileInfo.content, { filename: fileInfo.filename });
            } else {
                return {
                    success: false,
                    error: 'No file content or path provided'
                };
            }

            // Upload to our own /upload endpoint (internal call)
            const uploadUrl = `http://localhost:${process.env.PORT || 3000}/upload`;
            
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: form.getHeaders(),
                body: form as any
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `Upload failed: ${response.status} ${response.statusText} - ${errorText}`
                };
            }

            const uploadResult = await response.json() as {
                fileId: string;
                filename: string;
                size: number;
                expiresAt: number;
            };

            return {
                success: true,
                fileId: uploadResult.fileId,
                filename: uploadResult.filename,
                size: uploadResult.size,
                expiresAt: uploadResult.expiresAt,
                message: `File uploaded successfully. Use this fileId in run_file_compliance_review: ${uploadResult.fileId}. File will expire at ${new Date(uploadResult.expiresAt).toISOString()}.`
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during file upload'
            };
        }
    }

    private getFileInfo(file: any): { path?: string; content?: Buffer; filename: string } {
        if (typeof file === 'string') {
            return { path: file, filename: path.basename(file) };
        }
        
        if ('path' in file) {
            return { path: file.path, filename: path.basename(file.path) };
        }
        
        if ('content' in file && 'filename' in file) {
            const content = Buffer.from(file.content, 'base64');
            return { content, filename: file.filename };
        }
        
        throw new Error('Invalid file input format');
    }
}