// MCP Response types
export interface ServerResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  _meta?: {
    [key: string]: unknown;
  };
}

// Session state
export interface SessionState {
  token: string | null;
  isAuthenticated: boolean;
  sessionInfo: unknown | null;
}

// IB API response types
export interface TokenResponse {
  content: string;
}

export interface SessionInfo {
  SID: string;
  content: {
    session: {
      sid: string;
      userUuid: string;
      loginTime: number;
    };
    info: {
      clientname: string;
      apikey: string;
      apiV3url: string;
      [key: string]: unknown;
    };
  };
}