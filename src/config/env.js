import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SWAGGER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgres"),
  DB_NAME: z.string().default("qpass"),
  DATABASE_URL: z.string(),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_DATABASE: z.coerce.number().default(0),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("30m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  SOCKET_CORS_ORIGIN: z.string().default("http://localhost:3000"),

  PAYSTACK_SECRET_KEY: z.string().optional().default(""),
  PAYSTACK_PUBLIC_KEY: z.string().optional().default(""),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional().default(""),

  BREVO_API_KEY: z.string().optional().default(""),
  BREVO_SENDER_EMAIL: z.string().trim().optional().default(""),
  BREVO_SENDER_NAME: z.string().trim().optional().default(""),

  FRONTEND_URL: z.string().optional().default("http://localhost:3000"),

  // Google OAuth (Sign in with Google)
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_CALLBACK_URL: z.string().optional().default(""),
  OAUTH_FRONTEND_REDIRECT_URL: z.string().optional().default(""),

  SENTRY_DSN: z.string().optional().default(""),
}).superRefine((env, ctx) => {
  if (env.BREVO_API_KEY) {
    if (!env.BREVO_SENDER_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BREVO_SENDER_NAME is required and must not be blank when BREVO_API_KEY is set",
        path: ["BREVO_SENDER_NAME"],
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BREVO_SENDER_EMAIL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BREVO_SENDER_EMAIL must be a valid email address when BREVO_API_KEY is set",
        path: ["BREVO_SENDER_EMAIL"],
      });
    }
  }
});

export function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export { envSchema };
