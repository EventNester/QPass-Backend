import nodemailer from 'nodemailer';
import { getConfig, logger } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const config = getConfig();
  if (config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: Number(config.SMTP_PORT),
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const config = getConfig();
  const mailTransporter = getTransporter();

  if (!mailTransporter || config.NODE_ENV === 'test') {
    if (!mailTransporter && config.NODE_ENV !== 'test') {
      logger.warn({ to, subject }, 'SMTP not configured — email not sent');
    } else {
      logger.info({ to, subject }, 'Email sent (simulated)');
    }
    return true;
  }

  try {
    await mailTransporter.sendMail({
      from: config.BREVO_SENDER_EMAIL || 'noreply@qpass.com',
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (error) {
    logger.error({ err: error, to, subject }, 'Failed to send email');
    throw error;
  }
}

export async function sendPasswordResetEmail(email, resetToken) {
  const config = getConfig();
  const frontendUrl = config.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  const subject = 'QPass - Password Reset Request';
  const text = `You requested a password reset. Click the link below to reset your password (valid for 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
  const html = `
    <p>You requested a password reset.</p>
    <p>Click the link below to reset your password (valid for 15 minutes):</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you did not request this, please ignore this email.</p>
  `;

  return sendEmail({ to: email, subject, text, html });
}
