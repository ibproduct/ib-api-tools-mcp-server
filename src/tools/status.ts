import { z } from 'zod';

interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export const statusTool = {
  name: "status",
  description: "Check server and authentication status",
  inputSchema: z.object({}),
  handler: async (): Promise<ToolResponse> => {
    return {
      content: [
        {
          type: "text",
          text: "Server is running. Use the auth capability to authenticate."
        }
      ]
    };
  }
};