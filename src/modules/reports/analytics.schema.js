import { z } from "zod";

export const overviewQuerySchema = z.object({
  scope: z.enum(["own", "system"]).optional(),
});
