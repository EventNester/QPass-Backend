import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  mLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  mSendNotification: vi.fn(),
  getConfig: vi.fn(() => ({ NODE_ENV: "production", BREVO_API_KEY: "key" })),
  mSendTransactionalEmail: vi.fn(),
  mIsBrevoConfigured: vi.fn(() => true),
}));

vi.mock("../../config/index.js", () => ({
  getConfig: m.getConfig,
  logger: m.mLogger,
}));

vi.mock("../../modules/notifications/notification.service.js", () => ({
  sendNotification: m.mSendNotification,
}));

vi.mock("../../integrations/email/brevo.js", () => ({
  sendTransactionalEmail: m.mSendTransactionalEmail,
  isBrevoConfigured: m.mIsBrevoConfigured,
}));

describe("utils/email sendEmail", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.getConfig.mockReturnValue({ NODE_ENV: "production", BREVO_API_KEY: "key" });
    m.mIsBrevoConfigured.mockReturnValue(true);
    m.mSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
    emailUtils = await import("../email.js");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns true and warns when Brevo is not configured outside test env", async () => {
    m.mIsBrevoConfigured.mockReturnValue(false);

    const result = await emailUtils.sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

    expect(result).toBe(true);
    expect(m.mLogger.warn).toHaveBeenCalledWith({ to: "a@b.com", subject: "Hi" }, expect.any(String));
    expect(m.mLogger.info).not.toHaveBeenCalled();
    expect(m.mSendTransactionalEmail).not.toHaveBeenCalled();
  });

  test("returns true and logs simulated send in test env", async () => {
    m.getConfig.mockReturnValue({ NODE_ENV: "test", BREVO_API_KEY: "" });
    m.mIsBrevoConfigured.mockReturnValue(false);

    const result = await emailUtils.sendEmail({ to: "a@b.com", subject: "Hi" });

    expect(result).toBe(true);
    expect(m.mLogger.info).toHaveBeenCalled();
    expect(m.mLogger.warn).not.toHaveBeenCalled();
    expect(m.mSendTransactionalEmail).not.toHaveBeenCalled();
  });

  test("sends email through the Brevo REST API when configured", async () => {
    const result = await emailUtils.sendEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toBe(true);
    expect(m.mSendTransactionalEmail).toHaveBeenCalledWith({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(m.mLogger.info).not.toHaveBeenCalled();
  });

  test("rethrows send failures and logs the error", async () => {
    m.mSendTransactionalEmail.mockRejectedValue(new Error("Invalid Brevo API credentials"));

    await expect(emailUtils.sendEmail({ to: "a@b.com", subject: "Hi" }))
      .rejects.toThrow("Invalid Brevo API credentials");
    expect(m.mLogger.error).toHaveBeenCalled();
  });
});

describe("utils/email sendPasswordResetEmail", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.getConfig.mockReturnValue({ NODE_ENV: "production", BREVO_API_KEY: "key" });
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
