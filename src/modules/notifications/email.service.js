import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { logger, getConfig } from '../../config/index.js';

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
 * @returns {boolean} True when SMTP credentials are configured. Email delivery is
 * disabled for the MVP, so this only reflects whether stage-two config exists.
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

/**
 * Mask a recipient email for safe logging (e.g. john.doe@example.com -> j*******@example.com).
 */
export function maskRecipient(to) {
  return to.replace(/^(.)(.*)(@.*)$/, (_, first, rest, domain) => `${first}${'*'.repeat(rest.length)}${domain}`);
}

/**
 * Email delivery is deferred to stage two for the MVP. This is a simulated no-op
 * that always reports success so the product flow (endpoints and UI) can complete
 * without sending verification emails. Notification records are still created and
 * marked as SENT by the notification service.
 */
export async function sendEmail({ to, subject, template, text, html }) {
  if (!to || (!template && !html && !text)) {
    throw new Error('Recipient (to) and content (template, html, or text) are required');
  }

  const maskedTo = maskRecipient(to);

  logger.info(
    { to: maskedTo, subject, template },
    'Email delivery disabled in MVP — simulated successful send'
  );

  return {
    success: true,
    messageId: `simulated-${Date.now()}`,
    info: { status: 'simulated' },
    previewUrl: null,
  };
}

export default { sendEmail, renderTemplate, isEmailConfigured, maskRecipient };
