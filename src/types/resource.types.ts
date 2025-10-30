/**
 * Resource Type Definitions
 * Types for IntelligenceBank resources
 */

export interface IBResource {
    _id: string;
    name: string;
    folder: string;
    folderPath: Array<{
        name: string;
        _id: string;
    }>;
    file: {
        type: string;
        name: string;
        size: number;
        hash: string;
    };
    thumbnail?: string;
    fancyFileType: string;
    fancyFileSize: string;
    createTime: string;
    lastUpdateTime: string;
    tags: string[];
    allowedActions: string[];
    imageWidth?: number;
    imageHeight?: number;
    creatorName?: string;
}

export interface IBResourceResponse {
    response: {
        rows: IBResource[];
        offset: number;
        count: number;
    };
}