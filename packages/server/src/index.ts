#!/usr/bin/env node

import { logger } from '@reaatech/webhook-relay-core';
import { config } from '@reaatech/webhook-relay-core';
import { startMCPServer } from '@reaatech/webhook-relay-mcp';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { startHttpServer } from './server.js';

function handleShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal');
  try {
    DatabaseService.getInstance().close();
  } catch {
    // database may not be initialized
  }
  process.exit(0);
}

async function main() {
  try {
    logger.info({ event: 'server_starting' }, 'Starting webhook-relay-mcp');

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    const storage = StorageService.getInstance();
    await storage.initialize();

    if (config.mcpTransport === 'stdio') {
      await startMCPServer();
    } else {
      startHttpServer();
    }
  } catch (error) {
    logger.error({ error, event: 'server_error' }, 'Failed to start server');
    process.exit(1);
  }
}

main();

export { createApp, startHttpServer } from './server.js';
