import nodemailer from 'nodemailer'; // Fixed incorrect curly brace syntax
import { getConfig, logger } from '../config/index.js';
import { maskRecipient } from '../modules/notifications/email.service.js';
import { sendNotification } from '../modules/notifications/notification.service.js';

// Initialize the Nodemailer transporter using Port 465 (SSL)
let transporter = null;

function getTransporter() {
  if (!transporter) {
    const config = getConfig();
    transporter = nodemailer.createTransport({
      host: config.EMAIL_HOST,
      port: config.EMAIL_PORT,
      secure: true, // true for port 465
      auth: {
        user: config.EMAIL_HOST_USER,
        pass: config.EMAIL_HOST_PASSWORD,
      },
    });
  }
  return transporter;
}

/**
 * Core engine function that sends the physical email via Gmail SMTP
 */
export async function sendEmail({ to, subject, html, text }) {
  const config = getConfig();
  const maskedTo = maskRecipient(to);

  // If in a testing environment, bypass sending completely
  if (config.NODE_ENV === 'test') {
    logger.info({ to: maskedTo, subject }, 'Email sent (simulated)');
    return true;
  }

  // Ensure SMTP environment variables exist
  if (!config.EMAIL_HOST_USER || !config.EMAIL_HOST_PASSWORD) {
    logger.warn({ to: maskedTo, subject }, 'Gmail SMTP credentials not configured — email not sent');
    return false;
  }

  try {
    const smtp = getTransporter();
    
    await smtp.sendMail({
      from: `"QPass Events" <${config.EMAIL_HOST_USER}>`, // Displays your app name cleanly
      to,
      subject,
      text,
      html,
    });

    logger.info({ to: maskedTo, subject }, 'Email sent successfully via Gmail SMTP');
    return true;
  } catch (error) {
    logger.error({ err: error, to: maskedTo, subject }, 'Failed to send email via SMTP');
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
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('FRONTEND_URL is required in production');
  }
  const inviteUrl = `${frontendUrl || 'http://localhost:3000'}/accept-admin-invite?token=${inviteToken}`;

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
