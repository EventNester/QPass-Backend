import { z } from "zod";
import systemMessages from "../../config/system_messages.js";

const v = systemMessages.VALIDATION;

export const registerSchema = z.object({
  name: z.string().min(1, v.NAME_REQUIRED),
  email: z.string().email(v.INVALID_EMAIL),
  password: z
    .string()
    .min(8, v.PASSWORD_MIN)
    .regex(/[a-z]/, v.PASSWORD_LOWERCASE)
    .regex(/[A-Z]/, v.PASSWORD_UPPERCASE)
    .regex(/\d/, v.PASSWORD_NUMBER),
}).strip();

export const loginSchema = z.object({
  email: z.string().email(v.INVALID_EMAIL),
  password: z.string().min(1, v.PASSWORD_REQUIRED),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, v.TOKEN_REQUIRED),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, v.TOKEN_REQUIRED),
});
