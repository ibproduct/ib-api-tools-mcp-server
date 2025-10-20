/**
 * Express Server Setup
 * Extracted from index.ts lines 70-78
 * No logic changes - just moved to separate module
 */

import express, { Express } from 'express';
import cors from 'cors';

export function createExpressApp(): Express {
    // Same logic as lines 70-78 in index.ts
    const app = express();
    app.use(express.json());

    // Configure CORS
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS || '*',
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id']
    }));

    return app;
}