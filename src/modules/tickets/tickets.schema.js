import { z } from "zod";

export const createTicketTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().int().min(0, "Price cannot be negative"),
  capacity: z.number().int().min(1, "Capacity must be at least 1").optional(),
});

export const updateTicketTypeSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  description: z.string().optional(),
  price: z.number().int().min(0, "Price cannot be negative").optional(),
  capacity: z.number().int().min(1, "Capacity must be at least 1").optional(),
  active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided to update",
});

export const ticketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
});

export const exportTicketSchema = z.object({
  format: z.enum(["csv", "pdf"]),
});
