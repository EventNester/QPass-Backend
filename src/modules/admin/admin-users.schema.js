import { z } from "zod";
import { systemMessages } from "../../config/index.js";

const v = systemMessages.VALIDATION;

const passwordSchema = z
  .string()
  .min(8, v.PASSWORD_MIN)
  .regex(/[a-z]/, v.PASSWORD_LOWERCASE)
  .regex(/[A-Z]/, v.PASSWORD_UPPERCASE)
  .regex(/\d/, v.PASSWORD_NUMBER);

export const adminInviteSchema = z.object({
  email: z.string().email(v.INVALID_EMAIL),
});

export const adminInviteParamsSchema = z.object({
  token: z.string().min(1, v.INVITE_TOKEN_REQUIRED),
});

export const acceptAdminInviteSchema = z.object({
  name: z.string().min(1, v.NAME_REQUIRED),
  password: passwordSchema,
});

export const adminUserParamsSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
