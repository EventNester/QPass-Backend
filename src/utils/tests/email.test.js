import { describe, test, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  mLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  mSendNotification: vi.fn(),
  getConfig: vi.fn(() => ({})),
}));

vi.mock("../../config/index.js", () => ({
  getConfig: m.getConfig,
  logger: m.mLogger,
}));

vi.mock("../../modules/notifications/notification.service.js", () => ({
  sendNotification: m.mSendNotification,
}));

vi.mock("../../modules/notifications/email.service.js", () => ({
  maskRecipient: (to) => to.replace(/^(.)(.*)(@.*)$/, (_, first, rest, domain) => `${first}${'*'.repeat(rest.length)}${domain}`),
}));

describe("utils/email sendEmail (MVP simulated)", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    emailUtils = await import("../email.js");
  });

  test("returns true and logs a simulated send without touching SMTP", async () => {
    const result = await emailUtils.sendEmail({
      to: "recipient@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
    });

    expect(result).toBe(true);
    expect(m.mLogger.info).toHaveBeenCalledWith(
      { to: "r********@example.com", subject: "Hi" },
      "Email sent (simulated) — delivery disabled in MVP"
    );
  });
});

describe("utils/email helpers (MVP simulated)", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    emailUtils = await import("../email.js");
  });

  test("sendPasswordResetEmail records a notification with a fallback reset URL", async () => {
    m.mSendNotification.mockResolvedValue({ success: true });

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
    expect(result).toEqual({ success: true });
  });

  test("sendPasswordResetEmail uses the configured frontend URL", async () => {
    vi.stubEnv("FRONTEND_URL", "https://app.qpass.com");
    m.mSendNotification.mockResolvedValue({ success: true });

    await emailUtils.sendPasswordResetEmail("jane@example.com", "abc123");

    expect(m.mSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          name: "jane",
          resetUrl: "https://app.qpass.com/reset-password?token=abc123",
        }),
      })
    );
    vi.unstubAllEnvs();
  });

  test("sendEmailVerification records a notification with a verify URL", async () => {
    m.mSendNotification.mockResolvedValue({ success: true });

    const result = await emailUtils.sendEmailVerification("ada@example.com", "vtok1");

    expect(m.mSendNotification).toHaveBeenCalledWith({
      recipient: "ada@example.com",
      subject: "QPass - Verify Your Email",
      template: "email-verification",
      context: {
        name: "ada",
        verifyUrl: "http://localhost:3000/verify-email?token=vtok1",
        expiresIn: "15 minutes",
      },
    });
    expect(result).toEqual({ success: true });
  });

  test("sendOtpEmail records a notification with the code", async () => {
    m.mSendNotification.mockResolvedValue({ success: true });

    await emailUtils.sendOtpEmail("ada@example.com", "123456");

    expect(m.mSendNotification).toHaveBeenCalledWith({
      recipient: "ada@example.com",
      subject: "QPass - Your Email Verification Code",
      template: "otp-code",
      context: {
        name: "ada",
        otpCode: "123456",
        expiresIn: "10 minutes",
      },
    });
  });

  test("sendAdminInviteEmail records a notification with an invite URL", async () => {
    m.mSendNotification.mockResolvedValue({ success: true });

    await emailUtils.sendAdminInviteEmail("newadmin@example.com", "itok1");

    expect(m.mSendNotification).toHaveBeenCalledWith({
      recipient: "newadmin@example.com",
      subject: "QPass - You are invited as an Admin",
      template: "admin-invite",
      context: {
        name: "newadmin",
        inviteUrl: "http://localhost:3000/accept-admin-invite?token=itok1",
        expiresIn: "7 days",
      },
    });
  });
});
