import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => {
  const mTransporter = { sendMail: vi.fn() };
  return {
    mTransporter,
    mLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    mSendNotification: vi.fn(),
    getConfig: vi.fn(() => ({ NODE_ENV: "production" })),
    createTransport: vi.fn(() => mTransporter),
  };
});

vi.mock("../../config/index.js", () => ({
  getConfig: m.getConfig,
  logger: m.mLogger,
}));

vi.mock("../../modules/notifications/notification.service.js", () => ({
  sendNotification: m.mSendNotification,
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: m.createTransport },
}));

const SMTP_CONFIG = {
  NODE_ENV: "production",
  SMTP_HOST: "smtp.test.com",
  SMTP_PORT: "587",
  SMTP_USER: "user",
  SMTP_PASS: "pass",
};

describe("utils/email sendEmail", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.getConfig.mockReturnValue({ NODE_ENV: "production" });
    emailUtils = await import("../email.js");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns true and warns when SMTP is not configured outside test env", async () => {
    const result = await emailUtils.sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

    expect(result).toBe(true);
    expect(m.mLogger.warn).toHaveBeenCalledWith({ to: "a@b.com", subject: "Hi" }, expect.any(String));
    expect(m.mLogger.info).not.toHaveBeenCalled();
    expect(m.mTransporter.sendMail).not.toHaveBeenCalled();
  });

  test("returns true and logs simulated send in test env", async () => {
    m.getConfig.mockReturnValue({ NODE_ENV: "test" });

    const result = await emailUtils.sendEmail({ to: "a@b.com", subject: "Hi" });

    expect(result).toBe(true);
    expect(m.mLogger.info).toHaveBeenCalled();
    expect(m.mLogger.warn).not.toHaveBeenCalled();
    expect(m.mTransporter.sendMail).not.toHaveBeenCalled();
  });

  test("simulates send when transporter exists but env is test", async () => {
    m.getConfig.mockReturnValue(SMTP_CONFIG);
    await emailUtils.sendEmail({ to: "a@b.com", subject: "First" });
    m.mTransporter.sendMail.mockClear();

    m.getConfig.mockReturnValue({ NODE_ENV: "test" });
    const result = await emailUtils.sendEmail({ to: "a@b.com", subject: "Second" });

    expect(result).toBe(true);
    expect(m.mLogger.info).toHaveBeenCalled();
    expect(m.mTransporter.sendMail).not.toHaveBeenCalled();
  });

  test("sends email via transporter when SMTP is configured", async () => {
    m.getConfig.mockReturnValue({ ...SMTP_CONFIG, BREVO_SENDER_EMAIL: "sender@qpass.com" });
    m.mTransporter.sendMail.mockResolvedValue();

    const result = await emailUtils.sendEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toBe(true);
    expect(m.createTransport).toHaveBeenCalledWith({
      host: "smtp.test.com",
      port: 587,
      auth: { user: "user", pass: "pass" },
    });
    expect(m.mTransporter.sendMail).toHaveBeenCalledWith({
      from: "sender@qpass.com",
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  test("uses default from address when sender is not configured", async () => {
    m.getConfig.mockReturnValue(SMTP_CONFIG);
    m.mTransporter.sendMail.mockResolvedValue();

    await emailUtils.sendEmail({ to: "a@b.com", subject: "Hi" });

    expect(m.mTransporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@qpass.com" })
    );
  });

  test("rethrows send failures and logs the error", async () => {
    m.getConfig.mockReturnValue(SMTP_CONFIG);
    m.mTransporter.sendMail.mockRejectedValue(new Error("smtp down"));

    await expect(emailUtils.sendEmail({ to: "a@b.com", subject: "Hi" }))
      .rejects.toThrow("smtp down");
    expect(m.mLogger.error).toHaveBeenCalled();
  });

  test("reuses the transporter instance across sends", async () => {
    m.getConfig.mockReturnValue(SMTP_CONFIG);
    m.mTransporter.sendMail.mockResolvedValue();

    await emailUtils.sendEmail({ to: "a@b.com", subject: "1" });
    await emailUtils.sendEmail({ to: "a@b.com", subject: "2" });

    expect(m.createTransport).toHaveBeenCalledTimes(1);
  });
});

describe("utils/email sendPasswordResetEmail", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.getConfig.mockReturnValue({ NODE_ENV: "production" });
    emailUtils = await import("../email.js");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("throws when FRONTEND_URL is missing in production", async () => {
    vi.stubEnv("FRONTEND_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(emailUtils.sendPasswordResetEmail("test@example.com", "tok123"))
      .rejects.toThrow("FRONTEND_URL is required in production");
    expect(m.mSendNotification).not.toHaveBeenCalled();
  });

  test("falls back to localhost reset URL in test env", async () => {
    vi.stubEnv("FRONTEND_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    m.mSendNotification.mockResolvedValue({ status: "success" });

    const result = await emailUtils.sendPasswordResetEmail("john@example.com", "tok123");

    expect(m.mSendNotification).toHaveBeenCalledWith({
      recipient: "john@example.com",
      subject: "QPass - Password Reset Request",
      template: "password-reset",
      context: {
        name: "john",
        resetUrl: "http://localhost:3000/reset-password?token=tok123",
        expiresIn: "15 minutes",
      },
    });
    expect(result).toEqual({ status: "success" });
  });

  test("uses configured frontend URL for the reset link", async () => {
    vi.stubEnv("FRONTEND_URL", "https://app.qpass.com");
    vi.stubEnv("NODE_ENV", "production");
    m.mSendNotification.mockResolvedValue({ status: "success" });

    await emailUtils.sendPasswordResetEmail("jane@example.com", "abc123");

    expect(m.mSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          name: "jane",
          resetUrl: "https://app.qpass.com/reset-password?token=abc123",
        }),
      })
    );
  });
});
