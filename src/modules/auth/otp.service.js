import crypto from 'crypto';
import prisma from '../../database/index.js';
import { getRedisClient } from '../../config/redis.js';
import { UnauthorizedError } from '../../utils/error.js';
import { logger, systemMessages } from '../../config/index.js';
import { sendOtpEmail } from '../../utils/email.js';

const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_LENGTH = 6;
const REDIS_PREFIX = 'otp:email_verify:';

function generateOtp() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

/**
 * Send a 6-digit verification code to a user's email. The code is stored in
 * Redis and deleted if the email fails to send. Never reveals whether a user
 * exists or is already verified.
 *
 * @param {Object} payload - { email }
 * @returns {Promise<{success: boolean, code?: string, error?: string}>}
 */
export async function sendOtp({ email }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.deletedAt || user.emailVerifiedAt) {
    return { success: true, sent: false };
  }

  const code = generateOtp();
  const redis = getRedisClient();
  await redis.set(`${REDIS_PREFIX}${normalizedEmail}`, code, 'EX', OTP_TTL_SECONDS);

  const emailResult = await sendOtpEmail(user.email, code).catch(async (err) => {
    try {
      await redis.del(`${REDIS_PREFIX}${normalizedEmail}`);
    } catch { /* ignore cleanup error */ }
    return { success: false, error: err.message };
  });

  if (emailResult && emailResult.success === false) {
    try {
      await redis.del(`${REDIS_PREFIX}${normalizedEmail}`);
    } catch { /* ignore cleanup error */ }
    logger.error({ err: emailResult.error || 'unknown', email: normalizedEmail }, 'OTP email failed to send');
    return { success: false, error: emailResult.error || 'Failed to send verification code' };
  }

  return { success: true, code };
}

/**
 * Verify a user's email address with the 6-digit code emailed to them. The
 * code is single-use and expires after 10 minutes.
 *
 * @param {Object} payload - { email, code }
 * @returns {Promise<Object>} The updated user record
 * @throws {UnauthorizedError} If the code is invalid or expired
 */
export async function verifyOtp({ email, code }) {
  const normalizedEmail = email.trim().toLowerCase();
  const redis = getRedisClient();

  const stored = await redis.get(`${REDIS_PREFIX}${normalizedEmail}`);
  if (!stored || stored !== code) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.OTP_INVALID);
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.deletedAt) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.OTP_INVALID);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  await redis.del(`${REDIS_PREFIX}${normalizedEmail}`);

  return updated;
}
