import { z } from "zod";

export const scanQrSchema = z.object({
  token: z.string().min(1),
  deviceInfo: z.string().optional(),
});
