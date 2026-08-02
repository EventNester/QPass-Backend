import axios from "axios";
import { getConfig, logger } from "../../config/index.js";

// Brevo transactional email REST endpoint. SMTP ports are blocked by free
// hosting platforms (Railway, Vercel, etc.), so we use the REST API instead.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Error raised for any Brevo REST API failure. `status` mirrors the HTTP status
 * (0 for connection/timeout/configuration failures) and `retryable` tells
 * callers whether retrying the request is likely to help.
 */
export class BrevoApiError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = "BrevoApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function getBrevoConfig() {
  const config = getConfig();
  return {
    apiKey: config.BREVO_API_KEY,
    senderEmail: config.BREVO_SENDER_EMAIL || "noreply@qpass.com",
    senderName: config.BREVO_SENDER_NAME || "QPass",
  };
}

/**
 * @returns {boolean} True when a Brevo API key is configured in the environment
 */
export function isBrevoConfigured() {
  return Boolean(getBrevoConfig().apiKey);
}

function normalizeBrevoError(error) {
  if (error.response) {
    const { status, data } = error.response;
    const message = data?.message;
    if (status === 401 || status === 403) {
      return new BrevoApiError(
        "Invalid Brevo API credentials — check BREVO_API_KEY",
        status,
        false
      );
    }
    if (status === 400) {
      return new BrevoApiError(
        message || "Invalid email request — recipient address rejected",
        status,
        false
      );
    }
    if (status === 429) {
      return new BrevoApiError("Brevo API rate limit exceeded", status, true);
    }
    if (status >= 500) {
      return new BrevoApiError(
        message || `Brevo API request failed (HTTP ${status})`,
        status,
        true
      );
    }
    return new BrevoApiError(
      message || `Brevo API request failed (HTTP ${status})`,
      status,
      false
    );
  }

  if (error.code === "ECONNABORTED" || /timeout/i.test(error.message || "")) {
    return new BrevoApiError("Brevo API request timed out", 0, true);
  }

  return new BrevoApiError(
    error.message || "Failed to reach Brevo API",
    0,
    true
  );
}

function maskEmail(address) {
  return String(address).replace(
    /^(.)(.*)(@.*)$/,
    (_, first, rest, domain) => `${first}${"*".repeat(rest.length)}${domain}`
  );
}

/**
 * Send a transactional email through the Brevo REST API.
 *
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plain text body
 * @returns {Promise<{messageId: string|null}>} Provider message id
 * @throws {BrevoApiError} On configuration, validation, or API failures
 */
export async function sendTransactionalEmail({ to, subject, html, text }) {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();

  if (!apiKey) {
    throw new BrevoApiError("BREVO_API_KEY is not configured", 0, false);
  }

  if (!to || typeof to !== "string" || !to.includes("@")) {
    throw new BrevoApiError("Invalid recipient email address", 400, false);
  }

  if (!subject) {
    throw new BrevoApiError("Email subject is required", 400, false);
  }

  if (!html && !text) {
    throw new BrevoApiError("Email content (html or text) is required", 400, false);
  }

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
  };

  try {
    const response = await axios.post(BREVO_API_URL, payload, {
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    return { messageId: response.data?.messageId || null };
  } catch (error) {
    const brevoError = normalizeBrevoError(error);
    logger.error(
      { err: brevoError.message, status: brevoError.status, to: maskEmail(to), subject },
      "Brevo REST API request failed"
    );
    throw brevoError;
  }
}
