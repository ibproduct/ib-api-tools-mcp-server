export interface AuthState {
  token: string | null;
  loginStartTime: number | null;
  isAuthenticated: boolean;
  sessionInfo: any | null;
  error: string | null;
}

// Global auth state
const authState: AuthState = {
  token: null,
  loginStartTime: null,
  isAuthenticated: false,
  sessionInfo: null,
  error: null
};

export function getAuthState(): AuthState {
  return { ...authState };
}

export function updateAuthState(updates: Partial<AuthState>): void {
  Object.assign(authState, updates);
}

export function resetAuthState(): void {
  authState.token = null;
  authState.loginStartTime = null;
  authState.isAuthenticated = false;
  authState.sessionInfo = null;
  authState.error = null;
}

// Start polling for auth completion
export async function startPolling(token: string): Promise<void> {
  const pollInterval = 2000; // 2 seconds
  const maxPollTime = 5 * 60 * 1000; // 5 minutes

  updateAuthState({
    token,
    loginStartTime: Date.now(),
    isAuthenticated: false,
    sessionInfo: null,
    error: null
  });

  const pollTimer = setInterval(async () => {
    try {
      // Check if we've exceeded max poll time
      const elapsed = Date.now() - authState.loginStartTime!;
      if (elapsed > maxPollTime) {
        clearInterval(pollTimer);
        updateAuthState({
          error: 'Login flow expired. Please try again.',
          token: null,
          loginStartTime: null
        });
        return;
      }

      // Poll for session info
      const infoRes = await fetch(`${process.env.IB_API_URL}/v1/auth/app/info?token=${token}`);
      
      if (infoRes.status === 404) {
        // Still waiting for login
        return;
      }

      if (infoRes.status === 200) {
        // Login successful!
        clearInterval(pollTimer);
        const sessionInfo = await infoRes.json();
        updateAuthState({
          isAuthenticated: true,
          sessionInfo,
          error: null
        });
        return;
      }

      // Unexpected status
      throw new Error(`Unexpected status: ${infoRes.status}`);

    } catch (error) {
      console.error('Error polling for auth:', error);
      // Don't clear the interval - keep trying
    }
  }, pollInterval);
}