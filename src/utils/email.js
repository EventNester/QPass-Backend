import { getConfig, logger } from '../config/index.js';
import { sendTransactionalEmail, isBrevoConfigured } from '../integrations/email/brevo.js';
import { maskRecipient } from '../modules/notifications/email.service.js';
import { sendNotification } from '../modules/notifications/notification.service.js';

export async function sendEmail({ to, subject, html, text }) {
  const config = getConfig();
  const maskedTo = maskRecipient(to);

  if (config.NODE_ENV === 'test' || !isBrevoConfigured()) {
    if (config.NODE_ENV !== 'test') {
      logger.warn({ to: maskedTo, subject }, 'Brevo API not configured — email not sent');
    } else {
      logger.info({ to: maskedTo, subject }, 'Email sent (simulated)');
    }
    return true;
  }

  try {
    await sendTransactionalEmail({ to, subject, html, text });
    return true;
  } catch (error) {
    logger.error({ err: error, to: maskedTo, subject }, 'Failed to send email');
    throw error;
  }
}

export async function sendPasswordResetEmail(email, resetToken) {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('FRONTEND_URL is required in production');
  }
  const resetUrl = `${frontendUrl || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const subject = 'QPass - Password Reset Request';
  const context = {
    name: email.split('@')[0],
    resetUrl,
    expiresIn: '15 minutes',
  };

  return sendNotification({
    recipient: email,
    subject,
    template: 'password-reset',
    context,
  });
}

export async function sendEmailVerification(email, verifyToken) {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('FRONTEND_URL is required in production');
  }
  const verifyUrl = `${frontendUrl || 'http://localhost:3000'}/verify-email?token=${verifyToken}`;

  const subject = 'QPass - Verify Your Email';
  const context = {
    name: email.split('@')[0],
    verifyUrl,
    expiresIn: '15 minutes',
  };

  return sendNotification({
    recipient: email,
    subject,
    template: 'email-verification',
    context,
  });
}
