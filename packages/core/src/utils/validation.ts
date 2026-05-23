import { z } from 'zod';

export const subscribeSchema = z.object({
  eventTypes: z.array(z.string().min(1)).min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
  ttl: z.number().int().min(1).optional().default(3600),
});

export const pollSchema = z.object({
  subscriptionId: z.string().min(1),
  eventTypes: z.array(z.string()).optional(),
  timeout: z.number().min(0).max(120).optional().default(30),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export const historySchema = z.object({
  eventTypes: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  correlationId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export const registerSourceSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  sourceType: z.enum(['stripe', 'github', 'replicate', 'twilio', 'generic']),
  signingSecret: z.string().min(8),
  webhookUrl: z.string().url().optional(),
});
