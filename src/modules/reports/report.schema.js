import { z } from "zod";

export const reportEventIdParamsSchema = z.object({
  eventId: z.string().uuid("Invalid event ID format"),
});

export const exportQuerySchema = z.object({
  format: z.enum(["csv", "pdf"]).default("csv"),
});
