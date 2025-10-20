/**
 * HTML Page Generators for OAuth Flow
 */

export function generateSuccessPage(userInfo: any): string {
    // Same logic as lines 197-310 in index.ts
    const userName = userInfo?.name || userInfo?.given_name || 'User';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Successful</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 48px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .success-icon {
            width: 80px;
            height: 80px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            animation: scaleIn 0.5s ease-out;
        }
        .success-icon svg {
            width: 48px;
            height: 48px;
            stroke: white;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        .message {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .user-info {
            background: #f3f4f6;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .user-name {
            color: #1f2937;
            font-size: 18px;
            font-weight: 600;
        }
        .close-instruction {
            color: #9ca3af;
            font-size: 14px;
            font-style: italic;
        }
        @keyframes scaleIn {
            from {
                transform: scale(0);
                opacity: 0;
            }
            to {
                transform: scale(1);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">
            <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </div>
        <h1>Authentication Successful!</h1>
        <p class="message">
            You have successfully authenticated with IntelligenceBank.
        </p>
        <div class="user-info">
            <div class="user-name">Welcome, ${userName}!</div>
        </div>
        <p class="close-instruction">
            You can now close this window and return to Claude.
        </p>
    </div>
</body>
</html>`;
}

export function generateErrorPage(error: string, description?: string): string {
    // Same logic as lines 312-433 in index.ts
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 48px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .error-icon svg {
            width: 48px;
            height: 48px;
            stroke: white;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        .message {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .error-details {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
        }
        .error-code {
            color: #991b1b;
            font-family: monospace;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .error-description {
            color: #7f1d1d;
            font-size: 14px;
        }
        .action-button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.2s;
        }
        .action-button:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">
            <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
        </div>
        <h1>Authentication Failed</h1>
        <p class="message">
            We encountered an error during the authentication process.
        </p>
        ${error || description ? `
        <div class="error-details">
            ${error ? `<div class="error-code">Error: ${error}</div>` : ''}
            ${description ? `<div class="error-description">${description}</div>` : ''}
        </div>
        ` : ''}
        <p class="message">
            Please close this window and try again in Claude.
        </p>
    </div>
</body>
</html>`;
}