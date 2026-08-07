import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// 1. Set up high-level mocked tracking objects before code load execution blocks
const m = vi.hoisted(() => ({
  mLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  mSendNotification: vi.fn(),
  getConfig: vi.fn(() => ({ 
    NODE_ENV: "production", 
    EMAIL_HOST_USER: "qpassevents@gmail.com", 
    EMAIL_HOST_PASSWORD: "mock-app-password",
    EMAIL_HOST: "://gmail.com",
    EMAIL_PORT: 465
  })),
  mSendMail: vi.fn(),
}));

vi.mock("../../config/index.js", () => ({
  getConfig: m.getConfig,
  logger: m.mLogger,
}));

vi.mock("../../modules/notifications/notification.service.js", () => ({
  sendNotification: m.mSendNotification,
}));

// 2. Mock Nodemailer default exports and setup patterns
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: m.mSendMail,
    })),
  },
}));

describe("utils/email sendEmail", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.getConfig.mockReturnValue({ 
      NODE_ENV: "production", 
      EMAIL_HOST_USER: "qpassevents@gmail.com", 
      EMAIL_HOST_PASSWORD: "mock-app-password",
      EMAIL_HOST: "://gmail.com",
      EMAIL_PORT: 465
    });
    m.mSendMail.mockResolvedValue({ messageId: "smtp-mock-id" });
    emailUtils = await import("../email.js");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns false and warns with a masked recipient when Gmail SMTP keys are missing outside test env", async () => {
    m.getConfig.mockReturnValue({ NODE_ENV: "production", EMAIL_HOST_USER: null, EMAIL_HOST_PASSWORD: null });

    const result = await emailUtils.sendEmail({ to: "recipient@example.com", subject: "Hi", html: "<p>hi</p>" });

    expect(result).toBe(false);
    expect(m.mLogger.warn).toHaveBeenCalledWith(
      { to: "r********@example.com", subject: "Hi" },
      expect.any(String)
    );
    expect(m.mLogger.info).not.toHaveBeenCalled();
    expect(m.mSendMail).not.toHaveBeenCalled();
  });

  test("returns true and logs simulated send in test env with a masked recipient", async () => {
    m.getConfig.mockReturnValue({ NODE_ENV: "test", EMAIL_HOST_USER: "", EMAIL_HOST_PASSWORD: "" });

    const result = await emailUtils.sendEmail({ to: "recipient@example.com", subject: "Hi" });

    expect(result).toBe(true);
    expect(m.mLogger.info).toHaveBeenCalledWith(
      { to: "r********@example.com", subject: "Hi" },
      "Email sent (simulated)"
    );
    expect(m.mLogger.warn).not.toHaveBeenCalled();
    expect(m.mSendMail).not.toHaveBeenCalled();
  });

  test("sends email cleanly through the Gmail SMTP core connection layers when properly configured", async () => {
    const result = await emailUtils.sendEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toBe(true);
    expect(m.mSendMail).toHaveBeenCalledWith({
      from: '"QPass Events" <qpassevents@gmail.com>',
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(m.mLogger.info).toHaveBeenCalledWith(
      { to: "a***@b.com", subject: "Hi" }, 
      "Email sent successfully via Gmail SMTP"
    );
  });

  test("rethrows validation or transport errors out of Nodemailer and logs metrics", async () => {
    m.mSendMail.mockRejectedValue(new Error("Invalid SMTP login credentials"));

    await expect(emailUtils.sendEmail({ to: "a@b.com", subject: "Hi" }))
      .rejects.toThrow("Invalid SMTP login credentials");
    expect(m.mLogger.error).toHaveBeenCalled();
  });
});

describe("utils/email sendPasswordResetEmail", () => {
  let emailUtils;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.getConfig.mockReturnValue({ 
      NODE_ENV: "production", 
      EMAIL_HOST_USER: "qpassevents@gmail.com", 
      EMAIL_HOST_PASSWORD: "mock-app-password" 
    });
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
        name: expect.arrayContaining(["john"]), // Matches email.split('@') array mapping output 
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
          name: expect.arrayContaining(["jane"]),
          resetUrl: "https://app.qpass.com/reset-password?token=abc123",
        }),
      })
    );
  });
});
