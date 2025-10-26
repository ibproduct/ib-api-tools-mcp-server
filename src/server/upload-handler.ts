/**
 * File Upload Handler
 * 
 * Handles file uploads for remote MCP server deployments where the server
 * cannot access Claude's local filesystem. Provides a temporary file storage
 * system with automatic cleanup.
 */

import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Express, Request, Response } from 'express';

const UPLOAD_DIR = '/tmp/ib-mcp-uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const FILE_TTL = 5 * 60 * 1000; // 5 minutes

// Allowed file types (MIME types)
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg'
];

/**
 * Uploaded file metadata
 */
interface UploadedFile {
    id: string;
    filename: string;
    path: string;
    size: number;
    mimeType: string;
    uploadedAt: number;
    expiresAt: number;
}

/**
 * In-memory registry of uploaded files
 */
const uploadedFiles = new Map<string, UploadedFile>();

/**
 * Configure multer for memory storage
 */
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
    }
});

/**
 * Initialize upload directory
 */
async function initUploadDirectory() {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        console.log(`[Upload Handler] Upload directory initialized: ${UPLOAD_DIR}`);
    } catch (error) {
        console.error('[Upload Handler] Failed to create upload directory:', error);
    }
}

/**
 * Setup upload endpoint on Express app
 */
export function setupUploadEndpoint(app: Express): void {
    // Initialize upload directory
    initUploadDirectory();

    // Upload endpoint
    app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file provided' });
            }

            // Generate unique file ID
            const fileId = crypto.randomBytes(16).toString('hex');
            const filePath = path.join(UPLOAD_DIR, fileId);
            
            // Save file to disk
            await fs.writeFile(filePath, req.file.buffer);
            
            const uploadedFile: UploadedFile = {
                id: fileId,
                filename: req.file.originalname,
                path: filePath,
                size: req.file.size,
                mimeType: req.file.mimetype,
                uploadedAt: Date.now(),
                expiresAt: Date.now() + FILE_TTL
            };
            
            // Store metadata
            uploadedFiles.set(fileId, uploadedFile);
            
            // Schedule cleanup
            setTimeout(() => cleanupFile(fileId), FILE_TTL);
            
            console.log(`[Upload Handler] File uploaded: ${fileId} (${req.file.originalname}, ${req.file.size} bytes)`);
            
            res.json({
                fileId: fileId,
                filename: req.file.originalname,
                size: req.file.size,
                expiresAt: uploadedFile.expiresAt
            });
            
        } catch (error) {
            console.error('[Upload Handler] Upload error:', error);
            
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ 
                        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
                    });
                }
            }
            
            res.status(500).json({ 
                error: error instanceof Error ? error.message : 'Upload failed' 
            });
        }
    });

    console.log('[Upload Handler] Upload endpoint registered: POST /upload');
}

/**
 * Get uploaded file by ID
 */
export async function getUploadedFile(fileId: string): Promise<UploadedFile | null> {
    const file = uploadedFiles.get(fileId);
    if (!file) {
        console.log(`[Upload Handler] File not found: ${fileId}`);
        return null;
    }
    
    // Check if file has expired
    if (Date.now() > file.expiresAt) {
        console.log(`[Upload Handler] File expired: ${fileId}`);
        await cleanupFile(fileId);
        return null;
    }
    
    // Verify file still exists on disk
    try {
        await fs.access(file.path);
        return file;
    } catch {
        console.log(`[Upload Handler] File missing from disk: ${fileId}`);
        uploadedFiles.delete(fileId);
        return null;
    }
}

/**
 * Cleanup uploaded file
 */
async function cleanupFile(fileId: string): Promise<void> {
    const file = uploadedFiles.get(fileId);
    if (file) {
        try {
            await fs.unlink(file.path);
            console.log(`[Upload Handler] File cleaned up: ${fileId}`);
        } catch (error) {
            console.error(`[Upload Handler] Failed to delete file ${fileId}:`, error);
        }
        uploadedFiles.delete(fileId);
    }
}

/**
 * Manually cleanup a file (called after successful use)
 */
export async function cleanupUploadedFile(fileId: string): Promise<void> {
    await cleanupFile(fileId);
}

/**
 * Cleanup all files (called on server shutdown)
 */
export async function cleanupAllFiles(): Promise<void> {
    console.log('[Upload Handler] Cleaning up all uploaded files...');
    const fileIds = Array.from(uploadedFiles.keys());
    for (const fileId of fileIds) {
        await cleanupFile(fileId);
    }
}

/**
 * Get upload statistics
 */
export function getUploadStats() {
    const now = Date.now();
    const activeFiles = Array.from(uploadedFiles.values()).filter(f => f.expiresAt > now);
    const totalSize = activeFiles.reduce((sum, f) => sum + f.size, 0);
    
    return {
        activeFiles: activeFiles.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
}