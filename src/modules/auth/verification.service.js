import crypto from 'crypto';
import prisma from '../../database/index.js';
import { getRedisClient } from '../../config/redis.js';
import { UnauthorizedError } from '../../utils/error.js';
import { logger, systemMessages } from '../../config/index.js';
import { sendEmailVerification } from '../../utils/email.js';

const VERIFY_TOKEN_TTL_SECONDS = 900; // 15 minutes
const REDIS_PREFIX = 'verify_email:';

/**
 * Send a verification email to a user. The token is stored in Redis and
 * deleted if the email fails to send. Never reveals whether a user exists.
 *
 * @param {Object} user - User record
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function requestEmailVerification(user) {
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const redis = getRedisClient();

  await redis.set(`${REDIS_PREFIX}${verifyToken}`, user.id, 'EX', VERIFY_TOKEN_TTL_SECONDS);

  const emailResult = await sendEmailVerification(user.email, verifyToken).catch(async (err) => {
    try {
      await redis.del(`${REDIS_PREFIX}${verifyToken}`);
    } catch { /* ignore cleanup error */ }
    return { success: false, error: err.message };
  });

  if (emailResult && emailResult.success === false) {
    try {
      await redis.del(`${REDIS_PREFIX}${verifyToken}`);
    } catch { /* ignore cleanup error */ }
    logger.error({ err: emailResult.error || 'unknown' }, 'Verification email failed to send');
    return { success: false, error: emailResult.error || 'Failed to send verification email' };
  }

  return { success: true, verifyToken };
}

/**
 * Verify a user's email address using the token emailed to them.
 * @param {string} token - Verification token
 * @returns {Promise<Object>} The updated user record
 * @throws {UnauthorizedError} If the token is invalid or expired
 */
export async function verifyEmail(token) {
  const redis = getRedisClient();
  const userId = await redis.get(`${REDIS_PREFIX}${token}`);

  if (!userId) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.VERIFY_TOKEN_INVALID);
  }

  const existingUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!existingUser || existingUser.deletedAt) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.VERIFY_TOKEN_INVALID);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });

  await redis.del(`${REDIS_PREFIX}${token}`);

  return user;
}
