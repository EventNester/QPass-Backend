import { sendEmail as serviceSendEmail } from '../services/email.service.js';
import { sendNotification } from '../services/notification.service.js';

export async function sendEmail({ to, subject, html, text, template, context }) {
  return serviceSendEmail({ to, subject, html, text, template, context });
}

export async function sendPasswordResetEmail(email, resetToken) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

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
