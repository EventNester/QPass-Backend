import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import nodemailer from 'nodemailer';
import { logger } from '../../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, 'templates');

let cachedTransporter = null;
let etherealAccount = null;

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

export async function getEtherealAccount() {
  if (etherealAccount) {
    return etherealAccount;
  }
  etherealAccount = await nodemailer.createTestAccount();
  logger.info({ user: etherealAccount.user }, 'Created Nodemailer Ethereal test account');
  return etherealAccount;
}

let cachedEtherealTransporter = null;

export async function getTransporter(forceEthereal = false) {
  if (cachedTransporter && !forceEthereal) {
    return cachedTransporter;
  }

  const useEthereal = forceEthereal || process.env.USE_ETHEREAL === 'true';

  if (process.env.NODE_ENV === 'test' && !useEthereal && process.env.TEST_REAL_SMTP !== 'true') {
    cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
    return cachedTransporter;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BREVO_API_KEY, BREVO_SENDER_EMAIL } = process.env;

  if (!useEthereal && ((SMTP_HOST && SMTP_USER && SMTP_PASS) || BREVO_API_KEY)) {
    const host = SMTP_HOST || 'smtp-relay.brevo.com';
    const port = Number(SMTP_PORT) || 587;
    const user = SMTP_USER || BREVO_SENDER_EMAIL;
    const pass = SMTP_PASS || BREVO_API_KEY;

    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return cachedTransporter;
  }

  if (forceEthereal && cachedEtherealTransporter) {
    return cachedEtherealTransporter;
  }

  const account = await getEtherealAccount();
  const etherealTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });

  if (forceEthereal) {
    cachedEtherealTransporter = etherealTransporter;
  } else {
    cachedTransporter = etherealTransporter;
  }
  return etherealTransporter;
}
export function resetTransporterCache() {
  cachedTransporter = null;
  etherealAccount = null;
}

export async function verifySmtpConnection() {
  try {
    const transporter = await getTransporter();
    if (transporter.verify) {
      await transporter.verify();
    }
    return { success: true };
  } catch (error) {
    logger.warn({ err: error.message }, 'SMTP connection verification failed (non-blocking)');
    return { success: false, error: error.message };
  }
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

async function sendWithRetry(transporter, mailOptions, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return info;
    } catch (error) {
      lastError = error;
      logger.warn({ attempt, maxAttempts, err: error.message }, `Email send attempt ${attempt} failed`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      }
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

  const fromEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@qpass.com';
  const fromName = process.env.BREVO_SENDER_NAME || 'QPass';
  const from = `${fromName} <${fromEmail}>`;
  const maskedTo = to.replace(/^(.)(.*)(@.*)$/, (_, first, rest, domain) => `${first}${'*'.repeat(rest.length)}${domain}`);

  try {
    let renderedHtml = html;
    if (template && !renderedHtml) {
      renderedHtml = await renderTemplate(template, { ...context, subject });
    }

    const transporter = await getTransporter();

    const mailOptions = {
      from,
      to,
      subject,
      html: renderedHtml,
      text: text || (renderedHtml ? htmlToPlainText(renderedHtml) : ''),
    };

    const info = await sendWithRetry(transporter, mailOptions, maxAttempts);
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    logger.info(
      {
        to: maskedTo,
        subject,
        messageId: info.messageId,
        previewUrl,
      },
      'Email sent successfully'
    );

    return {
      success: true,
      messageId: info.messageId,
      info,
      previewUrl,
    };
  } catch (error) {
    logger.error({ err: error, to: maskedTo, subject }, 'SMTP connection or send failure (non-blocking)');
    return {
      success: false,
      error: error.message || 'SMTP connection failure',
      messageId: null,
      info: null,
      previewUrl: null,
    };
  }
}