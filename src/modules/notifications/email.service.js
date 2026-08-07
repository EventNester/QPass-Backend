import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { logger, getConfig } from '../../config/index.js';
import { sendEmail as executeSmtpSend } from '../../utils/email.js';

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
  'email-verification': 'email-verification.ejs',
  'admin-invite': 'admin-invite.ejs',
  'otp-code': 'otp-code.ejs',
  'import-summary': 'import-summary.ejs',
};

/**
 * @returns {boolean} True when the Gmail SMTP server environment details are configured
 */
export function isEmailConfigured() {
  const config = getConfig();
  return Boolean(config.EMAIL_HOST_USER && config.EMAIL_HOST_PASSWORD);
}

export async function renderTemplate(templateName, variables = {}) {
  const safeName = path.basename(templateName);
  const fileName = TEMPLATE_MAP[templateName] || (safeName.endsWith('.ejs') ? safeName : `${safeName}.ejs`);
  const templatePath = path.join(templatesDir, fileName);

  const html = await ejs.renderFile(templatePath, {
    appName: 'QPass', 
    year: new Date().getFullYear(),
    ...variables,
  });
  return html;
}

// Rewritten to accurately catch transient Nodemailer connection / network drops 
function isRetryableError(error) {
  const code = error?.code;
  const responseCode = error?.responseCode;

  // Catch network drops or transient 4xx / SMTP busy statuses
  return Boolean(
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAPI" ||
    (responseCode && responseCode >= 400 && responseCode < 500)
  );
}

async function sendWithRetry(payload, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Proxies directly out through your new Nodemailer engine
      const info = await executeSmtpSend(payload);
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

function htmlToPlainText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mask a recipient email for safe logging (e.g. john.doe@example.com -> j*******@example.com).
 */
export function maskRecipient(to) {
  return to.replace(/^(.)(.*)(@.*)$/, (_, first, rest, domain) => `${first}${'*'.repeat(rest.length)}${domain}`);
}

/**
 * Main wrapper called globally by your notifications system architecture
 */
export async function sendEmail({ to, subject, template, context = {}, text, html, maxAttempts = 3 }) {
  if (!to || (!template && !html && !text)) {
    throw new Error('Recipient (to) and content (template, html, or text) are required');
  }

  const maskedTo = maskRecipient(to);

  if (!isEmailConfigured()) {
    logger.error(
      { to: maskedTo, subject },
      'Email NOT sent — SMTP Credentials are missing; notification marked as failed'
    );
    return {
      success: false,
      error: 'Email not sent: Gmail SMTP is not configured',
      messageId: null,
      info: null,
      previewUrl: null,
    };
  }

  try {
    let renderedHtml = html;
    if (template && !renderedHtml) {
      renderedHtml = await renderTemplate(template, { ...context, subject });
    }

    const plainText = text || (renderedHtml ? htmlToPlainText(renderedHtml) : undefined);

    // Triggers the delivery workflow
    await sendWithRetry({ to, subject, html: renderedHtml, text: plainText }, maxAttempts);

    logger.info({ to: maskedTo, subject }, 'Email sent successfully via Gmail SMTP Gateway');

    return {
      success: true,
      messageId: `smtp-${Date.now()}`, // Generates consistent transaction hash schema fallback
      info: { status: 'delivered' },
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
