import crypto from 'crypto';
import prisma from '../../database/index.js';
import { getRedisClient } from '../../config/redis.js';
import { UnauthorizedError } from '../../utils/error.js';
import { logger, systemMessages } from '../../config/index.js';
import { hashPassword } from './auth.service.js';
import { sendPasswordResetEmail } from '../../utils/email.js';
import { writeAuditLog } from '../../utils/audit-log.js';
import { revokeAllSessions } from './session.service.js';

const RESET_TOKEN_TTL_SECONDS = 900; // 15 minutes
const REDIS_PREFIX = 'pwd_reset:';

export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    logger.warn('Password reset requested for non-existent email');
    return {};
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const redis = getRedisClient();

  await redis.set(`${REDIS_PREFIX}${resetToken}`, user.id, 'EX', RESET_TOKEN_TTL_SECONDS);

  const emailResult = await sendPasswordResetEmail(user.email, resetToken).catch(async (err) => {
    try {
      await redis.del(`${REDIS_PREFIX}${resetToken}`);
    } catch { /* ignore cleanup error */ }
    return { success: false, error: err.message };
  });

  if (emailResult && emailResult.success === false) {
    try {
      await redis.del(`${REDIS_PREFIX}${resetToken}`);
    } catch { /* ignore cleanup error */ }
    logger.error({ err: emailResult.error || 'unknown' }, 'Password reset email failed to send');
    return { success: false, error: emailResult.error || 'Failed to send reset email' };
  }
  return { resetToken };
}

export async function resetPassword(token, newPassword) {
  const redis = getRedisClient();
  const userId = await redis.get(`${REDIS_PREFIX}${token}`);

  if (!userId) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.RESET_TOKEN_INVALID);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await redis.del(`${REDIS_PREFIX}${token}`);

  await revokeAllSessions(userId);

  try {
    await writeAuditLog({
      actorId: userId,
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: userId,
    });
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to write PASSWORD_RESET audit log');
  }  return { success: true };
}
