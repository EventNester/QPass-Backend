import { z } from "zod";

/**
 * GET /public/events/:slug
 */
export const publicEventParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Event slug is required"),
});

/**
 * POST /public/events/:slug/register
 */
export const publicRegistrationParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Event slug is required"),
});

export const publicRegistrationSchema = z.object({
  attendeeName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100),

  attendeeEmail: z
    .string()
    .trim()
    .email("Invalid email address"),

  phone: z
    .string()
    .trim()
    .max(20)
    .optional(),

  ticketTypeId: z
    .string()
    .uuid("Invalid ticket type ID")
    .optional(),

  metadata: z
    .record(z.any())
    .optional(),
});