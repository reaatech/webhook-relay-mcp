import { z } from 'zod';

const filterValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.lazy(() => filterValueSchema)),
    z.record(
      z.string(),
      z.lazy(() => filterValueSchema),
    ),
  ]),
);

export const subscribeSchema = z.object({
  eventTypes: z.array(z.string().min(1)).min(1),
  filters: z.record(z.string(), filterValueSchema).optional(),
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
  sourceType: z.enum([
    'stripe',
    'github',
    'replicate',
    'sendgrid',
    'slack',
    'twilio',
    'vercel',
    'generic',
  ]),
  signingSecret: z.string().min(8),
  webhookUrl: z.string().url().optional(),
});

export const statsSchema = z.object({
  eventTypes: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  groupBy: z.enum(['type', 'source', 'hour', 'day']),
});

export const replaySchema = z.object({
  eventId: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const updateSourceSchema = z.object({
  name: z.string().min(1),
  updates: z
    .object({
      newName: z.string().min(1).max(100).optional(),
      signingSecret: z.string().min(8).optional(),
      isActive: z.boolean().optional(),
      webhookUrl: z.string().url().optional(),
    })
    .refine((obj) => Object.keys(obj).length > 0, {
      message: 'At least one update field must be provided',
    }),
});

export const deleteSourceSchema = z.object({
  name: z.string().min(1),
});

export const rotateSecretSchema = z.object({
  name: z.string().min(1),
  newSecret: z.string().min(8),
});

export const listSourcesSchema = z.object({
  activeOnly: z.boolean().optional().default(false),
  sourceType: z.string().optional(),
});

export const auditLogSchema = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const sourceHealthSchema = z.object({
  name: z.string().optional(),
});

export const eventTypesSchema = z.object({
  source: z.string().optional(),
});
