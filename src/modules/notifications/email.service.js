import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { logger } from '../../config/index.js';
import {
  sendTransactionalEmail,
  isBrevoConfigured,
  BrevoApiError,
} from '../../integrations/email/brevo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, 'templates');

const TEMPLATE_MAP = {
  registration: 'registration.ejs',
  qr: 'qr-issued.ejs',
  'qr-issued': 'qr-issued.ejs',
  payment: 'payment-verified.ejs',
  'payment-verified': 'payment-verified.ejs',
  staff: 'staff-invite.ejs',
  'staff-invite': 'staff-invite.ejs',
  'password-reset': 'password-reset.ejs',
  'import-summary': 'import-summary.ejs',
};

/**
 * @returns {boolean} True when the Brevo REST API is configured
 */
export function isEmailConfigured() {
  return isBrevoConfigured();
}

export async function renderTemplate(templateName, variables = {}) {
  const safeName = path.basename(templateName);
  const fileName = TEMPLATE_MAP[templateName] || (safeName.endsWith('.ejs') ? safeName : `${safeName}.ejs`);
  const templatePath = path.join(templatesDir, fileName);

  const html = await ejs.renderFile(templatePath, {
    appName: process.env.BREVO_SENDER_NAME || 'QPass',
    year: new Date().getFullYear(),
    ...variables,
  });
  return html;
}

// Only transient failures (rate limit, 5xx, network/timeout) warrant a retry.
// Invalid recipients and bad credentials would fail again identically.
function isRetryableError(error) {
  if (error instanceof BrevoApiError) {
    return error.retryable;
  }
  return true;
}

async function sendWithRetry(payload, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await sendTransactionalEmail(payload);
      return info;
    } catch (error) {
      lastError = error;
      logger.warn({ attempt, maxAttempts, err: error.message }, `Email send attempt ${attempt} failed`);
      if (!isRetryableError(error) || attempt >= maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
  throw lastError;
}

/**
 * Send an email with optional template rendering and retry logic.
 * Does not throw on failure — returns { success: false, error } instead.
 *
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} [options.template] - Template name (key in TEMPLATE_MAP)
 * @param {Object} [options.context] - Template variables
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body (overrides template)
 * @param {number} [options.maxAttempts=3] - Max send retry attempts
 * @returns {Promise<{success: boolean, messageId: string|null, info: Object|null, previewUrl: string|null, error?: string}>} Send result
 */
function htmlToPlainText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function sendEmail({ to, subject, template, context = {}, text, html, maxAttempts = 3 }) {
  if (!to || (!template && !html && !text)) {
    throw new Error('Recipient (to) and content (template, html, or text) are required');
  }

  const maskedTo = to.replace(/^(.)(.*)(@.*)$/, (_, first, rest, domain) => `${first}${'*'.repeat(rest.length)}${domain}`);

  try {
    let renderedHtml = html;
    if (template && !renderedHtml) {
      renderedHtml = await renderTemplate(template, { ...context, subject });
    }

    const plainText = text || (renderedHtml ? htmlToPlainText(renderedHtml) : undefined);

    const info = await sendWithRetry({ to, subject, html: renderedHtml, text: plainText }, maxAttempts);

    logger.info(
      {
        to: maskedTo,
        subject,
        messageId: info.messageId,
      },
      'Email sent successfully'
    );

    return {
      success: true,
      messageId: info.messageId,
      info,
      previewUrl: null,
    };
  } catch (error) {
    logger.error({ err: error, to: maskedTo, subject }, 'Email send failed (non-blocking)');
    return {
      success: false,
      error: error.message || 'Email send failure',
      messageId: null,
      info: null,
      previewUrl: null,
    };
  }
}
