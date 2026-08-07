import { logger } from '../config/index.js';
import { maskRecipient } from '../modules/notifications/email.service.js';
import { sendNotification } from '../modules/notifications/notification.service.js';

/**
 * Email delivery is deferred to stage two for the MVP. This core engine function
 * is a simulated no-op that always reports success so the product flow never
 * blocks on SMTP. Stage two re-enables real delivery here.
 */
export async function sendEmail({ to, subject }) {
  const maskedTo = maskRecipient(to);
  logger.info({ to: maskedTo, subject }, 'Email sent (simulated) — delivery disabled in MVP');
  return true;
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

export async function sendPasswordResetEmail(email, resetToken) {
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetToken}`;

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
  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${verifyToken}`;

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

export async function sendOtpEmail(email, otpCode) {
  const subject = 'QPass - Your Email Verification Code';
  const context = {
    name: email.split('@')[0],
    otpCode,
    expiresIn: '10 minutes',
  };

  return sendNotification({
    recipient: email,
    subject,
    template: 'otp-code',
    context,
  });
}

export async function sendAdminInviteEmail(email, inviteToken) {
  const inviteUrl = `${getFrontendUrl()}/accept-admin-invite?token=${inviteToken}`;

  const subject = 'QPass - You are invited as an Admin';
  const context = {
    name: email.split('@')[0],
    inviteUrl,
    expiresIn: '7 days',
  };

  return sendNotification({
    recipient: email,
    subject,
    template: 'admin-invite',
    context,
  });
}
