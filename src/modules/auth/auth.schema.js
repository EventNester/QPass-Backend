import { z } from "zod";
import { constants, systemMessages } from "../../config/index.js";

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
  role: z
    .enum(
      [
        constants.ROLES.ATTENDEE,
        constants.ROLES.ORGANIZER,
        constants.ROLES.STAFF,
      ],
      { message: v.INVALID_ROLE }
    )
    .default(constants.ROLES.ATTENDEE),
});

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

export const forgotPasswordSchema = z.object({
  email: z.string().email(v.INVALID_EMAIL),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, v.RESET_TOKEN_REQUIRED),
  password: z
    .string()
    .min(8, v.PASSWORD_MIN)
    .regex(/[a-z]/, v.PASSWORD_LOWERCASE)
    .regex(/[A-Z]/, v.PASSWORD_UPPERCASE)
    .regex(/\d/, v.PASSWORD_NUMBER),
});

