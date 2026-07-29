import { z } from "zod";

export const assignStaffSchema = z.object({
  email: z.string().email("Invalid email address"),
  permissionScope: z.string().optional(),
});
