import { z } from "zod";

export const scanQrSchema = z.object({
  token: z.string().min(1),
  deviceInfo: z.string().optional(),
});

export const checkinStatsQuerySchema = z.object({
  eventId: z.string().uuid("Invalid event ID format").optional(),
});

export const scanEventIdParamsSchema = z.object({
  eventId: z.string().uuid("Invalid event ID format"),
});

export const checkinListParamsSchema = z.object({
  eventId: z.string().uuid("Invalid event ID format"),
});

export const undoCheckinParamsSchema = z.object({
  eventId: z.string().uuid("Invalid event ID format"),
  checkInId: z.string().uuid("Invalid check-in ID format"),
});
