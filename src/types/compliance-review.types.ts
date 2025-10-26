/**
 * Type definitions for IntelligenceBank Compliance Review API
 */

/**
 * Category filter as returned by the API
 */
export interface ComplianceFilter {
    _id: string;
    id: number;
    name: string;
    multiple: string | boolean;  // API returns "0" or "1" as strings
    required: string | boolean;   // API returns "0" or "1" as strings
    filterValues: Array<{
        uuid: string;
        value: string;
        sortOrder: number;
        divisions?: string[];
    }>;
    SortAlpha?: string;
    createTime?: string;
    creator?: string;
    lastUpdateTime?: string;
    lastUpdater?: string;
    resourceFilterRange?: string;
    restrictedFolders?: string[];
    sortOrder?: number;
    tools?: string[];
    autoPropagateFolders?: string;
}

/**
 * Category filter value selection for compliance review
 */
export interface ComplianceCategorization {
    categoryName: string;
    selectedOptions: string[];
}

/**
 * File upload response from IntelligenceBank API
 */
export interface FileUploadResponse {
    response: {
        _id: string;
        type: string;
        tmp_name: string;
        size: number;
        name: string;
        error: number;
    };
}

/**
 * Compliance review creation response
 */
export interface ComplianceReviewCreateResponse {
    response: {
        data: {
            _id: string;
        };
    };
}

/**
 * Annotation information from compliance review comment
 */
export interface AnnotationInfo {
    color: string;
    content?: string | null;
    id: string;
    page: number;
    type: string;
    x: number;
    y: number;
}

/**
 * Compliance review comment (individual finding/trigger)
 */
export interface ComplianceReviewComment {
    id: number;
    _id: string;
    temporalActivityAttempt: number;
    revision: number;
    messageFormat: string;
    ruleCollapsed: boolean;
    resolved: boolean;
    compCheckSentence: string;
    compCheckSentenceStart: number;
    compCheckTerm: string;
    compCheckTermStart: number;
    compCheckExplanation: string;
    compCheckFeedback?: string;
    compCheckStatus: string;
    compCheckSortPage: number;
    compCheckSortTopY: number;
    annotationInfo: AnnotationInfo;
    compCheckRuleTriggerMappingId: string;
    compCheckTriggerId: string;
    compCheckRuleId: string;
    compCheckReviewId: string;
    ruleName: string;
    ruleDescription: string;
    sourceArchived: boolean;
    lastUpdater: string;
    suggestionEnabled: boolean;
    addToDictEnabled: boolean;
    sourceBindItemType: string;
    source: string;
    ownerDivision: string;
    triggeredBy: string;
    ownerUser: string;
    lastUpdateTime: string;
    sourceBindItem: string;
    ownerGroups: string[];
    xfdfString?: string;
    sessionIds?: string[];
    creator: string;
    compCheckAppType: string;
    sourceType: string;
    temporalActivityId: string;
    createTime: string;
}

/**
 * Compliance review status response
 */
export interface ComplianceReviewStatusResponse {
    response: {
        data: {
            _id: string;
            id: number;
            status: 'pending' | 'completed' | 'error' | 'failed';
            appType?: string;
            categorisation?: ComplianceCategorization[];
            categorisationHash?: number;
            comments?: ComplianceReviewComment[];
            createTime?: string;
            creator?: string;
            documentId?: string;
            lastUpdateTime?: string;
            lastUpdater?: string;
            ownerDivision?: string;
            ownerGroups?: string[];
            ownerUser?: string;
            reviewId?: string;
            source?: string;
            sourceType?: string;
            temporalActivityAttempt?: number;
            temporalActivityId?: string;
            temporaryReviewId?: string;
            totalTriggerNum?: number;
            triggeredRuleNum?: number;
            triggeredBy?: string;
            error?: string;
            errorMessage?: string;
        };
    };
}

/**
 * Formatted compliance review comment for user-friendly output
 */
export interface FormattedComplianceComment {
    id: number;
    term: string;
    explanation: string;
    sentence: string;
    sentenceStart: number;
    termStart: number;
    ruleName: string;
    ruleDescription: string;
    feedback?: string;
    page: number;
    position: {
        x: number;
        y: number;
    };
    status: string;
    resolved: boolean;
}

/**
 * Complete compliance review result (user-facing)
 */
export interface ComplianceReviewResult {
    success: boolean;
    reviewId: string;
    filename: string;
    processingTime: number;  // In seconds
    status: 'pending' | 'completed' | 'error' | 'failed';
    categorization: ComplianceCategorization[];
    totalTriggers?: number;
    triggeredRules?: number;
    comments?: FormattedComplianceComment[];
    summary?: {
        totalIssues: number;
        issuesByRule: Record<string, number>;
        issuesByPage: Record<number, number>;
    };
    error?: string;
    message?: string;
}

/**
 * File input - flexible format supporting paths and base64 content
 */
export type FileInput = 
    | string  // File path
    | { path: string }  // Object with path
    | { content: string; filename: string };  // Base64 content with filename