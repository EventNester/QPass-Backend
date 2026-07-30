import { z } from 'zod';

export const importFileParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

export const importBatchParamsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  batchId: z.string().uuid('Invalid batch ID format'),
});
