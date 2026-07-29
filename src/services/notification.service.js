import prisma from '../database/index.js';
import { sendEmail } from './email.service.js';
import { logger } from '../config/index.js';

export async function sendNotification({
  recipient,
  subject,
  template,
  context = {},
  channel = 'EMAIL',
  userId = null,
  eventId = null,
  registrationId = null,
  maxAttempts = 3,
}) {
  const notification = await prisma.notification.create({
    data: {
      recipient,
      channel,
      template: template || 'custom',
      status: 'PENDING',
      userId,
      eventId,
      registrationId,
    },
  });

  try {
    const result = await sendEmail({
      to: recipient,
      subject,
      template,
      context,
      maxAttempts,
    });

    const updatedNotification = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'SENT',
        providerMessageId: result.messageId || null,
        sentAt: new Date(),
        failureReason: null,
      },
    });

    return {
      success: true,
      notification: updatedNotification,
      previewUrl: result.previewUrl || null,
    };
  } catch (error) {
    logger.error({ err: error, notificationId: notification.id }, 'Notification email send failed');

    const updatedNotification = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        failureReason: error.message || 'Unknown error',
      },
    });

    return {
      success: false,
      notification: updatedNotification,
      error: error.message,
    };
  }
}

export async function getNotificationById(id) {
  return prisma.notification.findUnique({
    where: { id },
  });
}

export async function getNotificationsByRecipient(recipient) {
  return prisma.notification.findMany({
    where: { recipient },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getNotificationsByUser(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getNotificationsByEvent(eventId) {
  return prisma.notification.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function retryNotification(notificationId, context = {}) {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    throw new Error('Notification not found');
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { status: 'PENDING', failureReason: null },
  });

  try {
    const result = await sendEmail({
      to: notification.recipient,
      subject: `[Retry] Notification for ${notification.template}`,
      template: notification.template,
      context,
    });

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'SENT',
        providerMessageId: result.messageId || null,
        sentAt: new Date(),
        failureReason: null,
      },
    });

    return { success: true, notification: updated, previewUrl: result.previewUrl || null };
  } catch (error) {
    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'FAILED',
        failureReason: error.message || 'Unknown error',
      },
    });

    return { success: false, notification: updated, error: error.message };
  }
}
