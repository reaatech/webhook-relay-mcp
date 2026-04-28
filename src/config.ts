import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  databasePath: z.string().default('./data/webhook-relay.db'),
  encryptionKey: z.string().min(1),
  mcpTransport: z.enum(['stdio', 'sse']).default('stdio'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  logFormat: z.enum(['json', 'pretty']).default('json'),
  webhookBaseUrl: z.string().url().default('http://localhost:3000'),
  eventRetentionDays: z.coerce.number().default(30),
  adminApiKey: z.string().min(1).optional(),
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),
});

const raw = {
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  databasePath: process.env.DATABASE_PATH,
  encryptionKey: process.env.ENCRYPTION_KEY,
  mcpTransport: process.env.MCP_TRANSPORT,
  logLevel: process.env.LOG_LEVEL,
  logFormat: process.env.LOG_FORMAT,
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
  eventRetentionDays: process.env.EVENT_RETENTION_DAYS,
  adminApiKey: process.env.ADMIN_API_KEY,
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
};

const parsed = configSchema.safeParse(raw);

if (!parsed.success) {
  console.error('Invalid configuration:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
