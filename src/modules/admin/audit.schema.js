import { z } from "zod";

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(50).optional(),
  entity: z.string().trim().min(1).max(50).optional(),
  actorId: z.string().uuid("Invalid actor ID format").optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
