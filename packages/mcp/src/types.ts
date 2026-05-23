import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolHandler {
  definition: Tool;
  execute(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      items?: { type: string };
      enum?: string[];
      default?: unknown;
    }
  >;
  required?: string[];
  [key: string]: unknown;
}

export function defineTool(
  name: string,
  description: string,
  inputSchema: ToolInputSchema,
  execute: (
    args: Record<string, unknown>
  ) => Promise<{ content: Array<{ type: string; text: string }> }>
): ToolHandler {
  return {
    definition: {
      name,
      description,
      inputSchema,
    },
    execute,
  };
}
