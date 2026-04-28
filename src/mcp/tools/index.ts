import type { MCPServer } from '../server.js';
import { subscribeTool } from './subscribe.js';
import { pollTool } from './poll.js';
import { historyTool } from './history.js';
import { registerTool } from './register.js';
import { unsubscribeTool } from './unsubscribe.js';
import { listTool } from './list.js';

export function registerAllTools(server: MCPServer): void {
  server.registerTool(subscribeTool);
  server.registerTool(pollTool);
  server.registerTool(historyTool);
  server.registerTool(registerTool);
  server.registerTool(unsubscribeTool);
  server.registerTool(listTool);
}

export { subscribeTool } from './subscribe.js';
export { pollTool, notifyPollWaiters } from './poll.js';
export { historyTool } from './history.js';
export { registerTool } from './register.js';
export { unsubscribeTool } from './unsubscribe.js';
export { listTool } from './list.js';
