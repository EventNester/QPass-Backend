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

const phoneRegex = /^\+?[0-9]{7,15}$/;

export const updateProfileSchema = z
  .object({
    name: z.string().min(1, v.NAME_REQUIRED).max(100, v.NAME_TOO_LONG).optional(),
    phone: z
      .union([z.string().regex(phoneRegex, v.PHONE_INVALID), z.literal('')])
      .optional(),
  })
  .strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, v.CURRENT_PASSWORD_REQUIRED),
  newPassword: z
    .string()
    .min(8, v.PASSWORD_MIN)
    .max(128, v.PASSWORD_MAX)
    .regex(/[a-z]/, v.PASSWORD_LOWERCASE)
    .regex(/[A-Z]/, v.PASSWORD_UPPERCASE)
    .regex(/\d/, v.PASSWORD_NUMBER),
});
export const verifyEmailSchema = z.object({
  token: z.string().min(1, v.VERIFY_TOKEN_REQUIRED),
});

export const sendOtpSchema = z.object({
  email: z.string().email(v.INVALID_EMAIL),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(v.INVALID_EMAIL),
  code: z.string().regex(/^\d{6}$/, v.OTP_CODE_INVALID),
});

export const sessionParamsSchema = z.object({
  sessionId: z
    .string()
    .min(1, v.SESSION_ID_REQUIRED)
    .regex(/^[a-f0-9]{64}$/, v.SESSION_ID_INVALID),
});

