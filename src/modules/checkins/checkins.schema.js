import { z } from "zod";

export const scanQrSchema = z.object({
  token: z.string().min(1),
  deviceInfo: z.string().optional(),
});

export const checkinStatsQuerySchema = z.object({
  eventId: z.string().uuid("Invalid event ID format").optional(),
});
