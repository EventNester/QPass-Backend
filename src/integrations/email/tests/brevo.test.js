import { describe, test, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => {
  const mAxiosPost = vi.fn();
  const mLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const mGetConfig = vi.fn(() => ({
    BREVO_API_KEY: "test-api-key",
    BREVO_SENDER_EMAIL: "noreply@qpass.com",
    BREVO_SENDER_NAME: "QPass",
  }));
  return { mAxiosPost, mLogger, mGetConfig };
});

vi.mock("axios", () => ({ default: { post: m.mAxiosPost } }));

vi.mock("../../../config/index.js", () => ({
  getConfig: m.mGetConfig,
  logger: m.mLogger,
}));

import { sendTransactionalEmail, isBrevoConfigured, BrevoApiError } from "../brevo.js";

function apiError(status, data = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  return err;
}

function timeoutError() {
  const err = new Error("timeout of 15000ms exceeded");
  err.code = "ECONNABORTED";
  return err;
}

describe("Brevo REST client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.mGetConfig.mockReturnValue({
      BREVO_API_KEY: "test-api-key",
      BREVO_SENDER_EMAIL: "noreply@qpass.com",
      BREVO_SENDER_NAME: "QPass",
    });
  });

  describe("isBrevoConfigured", () => {
    test("returns true when an API key is set", () => {
      expect(isBrevoConfigured()).toBe(true);
    });

    test("returns false when the API key is missing", () => {
      m.mGetConfig.mockReturnValue({ BREVO_API_KEY: "", BREVO_SENDER_EMAIL: "noreply@qpass.com" });
      expect(isBrevoConfigured()).toBe(false);
    });
  });

  describe("sendTransactionalEmail", () => {
    test("sends a successful request and returns the provider message id", async () => {
      m.mAxiosPost.mockResolvedValue({ data: { messageId: "brevo-msg-1" } });

      const result = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      expect(result).toEqual({ messageId: "brevo-msg-1" });
      expect(m.mAxiosPost).toHaveBeenCalledWith(
        "https://api.brevo.com/v3/smtp/email",
        {
          sender: { name: "QPass", email: "noreply@qpass.com" },
          to: [{ email: "user@example.com" }],
          subject: "Welcome",
          htmlContent: "<p>Hi</p>",
          textContent: "Hi",
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            "api-key": "test-api-key",
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          timeout: expect.any(Number),
        })
      );
    });

    test("returns null message id when the response omits it", async () => {
      m.mAxiosPost.mockResolvedValue({ data: {} });

      const result = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      });

      expect(result).toEqual({ messageId: null });
    });

    test("throws when the API key is not configured", async () => {
      m.mGetConfig.mockReturnValue({ BREVO_API_KEY: "", BREVO_SENDER_EMAIL: "noreply@qpass.com" });

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("BREVO_API_KEY is not configured");
      expect(error.status).toBe(0);
      expect(error.retryable).toBe(false);
      expect(m.mAxiosPost).not.toHaveBeenCalled();
    });

    test("throws for an invalid recipient email", async () => {
      const error = await sendTransactionalEmail({
        to: "not-an-email",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Invalid recipient email address");
      expect(error.status).toBe(400);
      expect(error.retryable).toBe(false);
      expect(m.mAxiosPost).not.toHaveBeenCalled();
    });

    test("throws when the subject is missing", async () => {
      const error = await sendTransactionalEmail({
        to: "user@example.com",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Email subject is required");
      expect(error.status).toBe(400);
    });

    test("throws when no content is provided", async () => {
      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Email content (html or text) is required");
      expect(error.status).toBe(400);
    });

    test("maps 401 to an API credential error that is not retryable", async () => {
      m.mAxiosPost.mockRejectedValue(apiError(401, { code: "unauthorized", message: "api key invalid" }));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Invalid Brevo API credentials — check BREVO_API_KEY");
      expect(error.status).toBe(401);
      expect(error.retryable).toBe(false);
    });

    test("maps 403 to an API credential error", async () => {
      m.mAxiosPost.mockRejectedValue(apiError(403));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error.message).toBe("Invalid Brevo API credentials — check BREVO_API_KEY");
      expect(error.status).toBe(403);
      expect(error.retryable).toBe(false);
    });

    test("maps 400 with a provider message to a descriptive error", async () => {
      m.mAxiosPost.mockRejectedValue(apiError(400, { message: "No valid recipients" }));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("No valid recipients");
      expect(error.status).toBe(400);
      expect(error.retryable).toBe(false);
    });

    test("maps 429 rate limit to a retryable error", async () => {
      m.mAxiosPost.mockRejectedValue(apiError(429));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Brevo API rate limit exceeded");
      expect(error.status).toBe(429);
      expect(error.retryable).toBe(true);
    });

    test("maps 5xx responses to a retryable error", async () => {
      m.mAxiosPost.mockRejectedValue(apiError(502, { message: "Bad gateway" }));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Bad gateway");
      expect(error.status).toBe(502);
      expect(error.retryable).toBe(true);
    });

    test("maps other HTTP statuses to a non-retryable error", async () => {
      m.mAxiosPost.mockRejectedValue(apiError(404, { message: "Endpoint not found" }));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Endpoint not found");
      expect(error.status).toBe(404);
      expect(error.retryable).toBe(false);
    });

    test("maps request timeouts to a descriptive retryable error", async () => {
      m.mAxiosPost.mockRejectedValue(timeoutError());

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.message).toBe("Brevo API request timed out");
      expect(error.status).toBe(0);
      expect(error.retryable).toBe(true);
    });

    test("maps generic network failures to a retryable error", async () => {
      m.mAxiosPost.mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.brevo.com"));

      const error = await sendTransactionalEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BrevoApiError);
      expect(error.status).toBe(0);
      expect(error.retryable).toBe(true);
    });
  });
});
