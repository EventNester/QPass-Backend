import crypto from 'crypto';
import prisma from '../../database/index.js';
import { getRedisClient } from '../../config/redis.js';
import { UnauthorizedError } from '../../utils/error.js';
import { logger, systemMessages } from '../../config/index.js';
import { hashPassword } from './auth.service.js';
import { sendPasswordResetEmail } from '../../utils/email.js';

const RESET_TOKEN_TTL_SECONDS = 900; // 15 minutes
const REDIS_PREFIX = 'pwd_reset:';

export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    logger.warn({ email }, 'Password reset requested for non-existent email');
    await new Promise((r) => setTimeout(r, 200));
    return {};
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const redis = getRedisClient();

  try {
    await sendPasswordResetEmail(user.email, resetToken);
  } catch {
    logger.error({ email }, 'Password reset email send failed');
    return {};
  }

  await redis.set(`${REDIS_PREFIX}${resetToken}`, user.id, 'EX', RESET_TOKEN_TTL_SECONDS);

  return process.env.NODE_ENV === 'production' ? {} : { resetToken };
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

  return { success: true };
}
