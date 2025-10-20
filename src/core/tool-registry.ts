/**
 * Tool Registry System
 * New module for managing tool registration
 * Provides centralized tool management without changing tool logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: any;
    outputSchema: any;
}

export interface Tool {
    definition: ToolDefinition;
    execute: (params: any) => Promise<any>;
}

export class ToolRegistry {
    private tools = new Map<string, Tool>();

    register(tool: Tool): void {
        this.tools.set(tool.definition.name, tool);
        console.log(`Registered tool: ${tool.definition.name}`);
    }

    getAll(): Tool[] {
        return Array.from(this.tools.values());
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * Register all tools with an MCP server
     * This maintains the same registration pattern as the original index.ts
     */
    registerWithMcpServer(server: McpServer): void {
        for (const tool of this.tools.values()) {
            server.registerTool(
                tool.definition.name,
                {
                    title: tool.definition.title,
                    description: tool.definition.description,
                    inputSchema: tool.definition.inputSchema,
                    outputSchema: tool.definition.outputSchema
                },
                async (params: any) => tool.execute(params)
            );
        }
    }
}