import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  CORS_ORIGIN: z.string().default("*"),
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

  PAYSTACK_SECRET_KEY: z.string().optional().default(""),
  PAYSTACK_PUBLIC_KEY: z.string().optional().default(""),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional().default(""),

  BREVO_API_KEY: z.string().optional().default(""),
  BREVO_SENDER_EMAIL: z.string().optional().default("noreply@qpass.com"),
  BREVO_SENDER_NAME: z.string().optional().default("QPass"),

  SENTRY_DSN: z.string().optional().default(""),
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
