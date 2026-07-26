import { z } from "zod";

export const createEventSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must not exceed 200 characters"),

    description: z
      .string()
      .optional(),

    venue: z
      .string()
      .optional(),

    startTime: z.coerce.date(),

    endTime: z.coerce.date(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export const updateEventSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must not exceed 200 characters")
      .optional(),

    description: z
      .string()
      .optional(),

    venue: z
      .string()
      .optional(),

    startTime: z
      .coerce
      .date()
      .optional(),

    endTime: z
      .coerce
      .date()
      .optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return data.endTime > data.startTime;
      }
      return true;
    },
    {
      message: "End time must be after start time when both are provided",
      path: ["endTime"],
    }
  )
  .superRefine((data, ctx) => {
    if (data.startTime && !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endTime is required when startTime is provided",
        path: ["endTime"],
      });
    }
    if (data.endTime && !data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTime is required when endTime is provided",
        path: ["startTime"],
      });
    }
  });