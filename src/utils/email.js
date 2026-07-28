import nodemailer from 'nodemailer';
import { logger } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const mailTransporter = getTransporter();

  if (!mailTransporter || process.env.NODE_ENV === 'test') {
    logger.info({ to, subject }, 'Email sent (simulated)');
    return true;
  }

  try {
    await mailTransporter.sendMail({
      from: process.env.BREVO_SENDER_EMAIL || 'noreply@qpass.com',
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
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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
