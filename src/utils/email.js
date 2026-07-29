import nodemailer from 'nodemailer';
import { getConfig, logger } from '../config/index.js';
import { sendNotification } from '../services/notification.service.js';

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
