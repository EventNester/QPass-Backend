import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { forgotPassword, resetPassword } from '../password.service.js';
import prisma from '../../../database/index.js';
import { UnauthorizedError } from '../../../utils/error.js';


const mRedisClient = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  scan: vi.fn().mockResolvedValue(['0', []]),
};

vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mRedisClient),
}));

vi.mock('../../../config/index.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  systemMessages: {
    ERROR: {
      AUTH: { RESET_TOKEN_INVALID: 'Invalid or expired password reset token' },
      GENERAL: { NOT_FOUND: 'Resource not found' },
    },
  },
}));

vi.mock('../../../utils/audit-log.js', () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('./auth.service.js', () => ({
  hashPassword: vi.fn((pw) => Promise.resolve(`hashed_${pw}`)),
}));

vi.mock('../../../utils/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

describe('Password Service', () => {
  const mockUser = {
    id: 'user-id-123',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: 'old-hash',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('forgotPassword', () => {
    test('should silently return empty object if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await forgotPassword('unknown@example.com');

      expect(result).toEqual({});
    });

    test('should generate reset token, store in redis, and send email if user exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      mRedisClient.set.mockResolvedValue('OK');

      const result = await forgotPassword(mockUser.email);

      expect(result.resetToken).toBeDefined();
      expect(typeof result.resetToken).toBe('string');
      expect(mRedisClient.set).toHaveBeenCalledWith(
        `pwd_reset:${result.resetToken}`,
        mockUser.id,
        'EX',
        900
      );
      const { sendPasswordResetEmail } = await import('../../../utils/email.js');
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(mockUser.email, result.resetToken);
    });

    test('should return the reset token in production (MVP has no email delivery)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      prisma.user.findUnique.mockResolvedValue(mockUser);
      mRedisClient.set.mockResolvedValue('OK');

      const result = await forgotPassword(mockUser.email);

      expect(result.resetToken).toBeDefined();
      expect(typeof result.resetToken).toBe('string');
      expect(mRedisClient.set).toHaveBeenCalled();
      const { sendPasswordResetEmail } = await import('../../../utils/email.js');
      expect(sendPasswordResetEmail).toHaveBeenCalled();
    });

    test('should delete the redis token when the reset email fails', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      mRedisClient.set.mockResolvedValue('OK');
      mRedisClient.del.mockResolvedValue(1);
      const { sendPasswordResetEmail } = await import('../../../utils/email.js');
      sendPasswordResetEmail.mockRejectedValue(new Error('SMTP connection timeout'));

      const result = await forgotPassword(mockUser.email);

      expect(result).toEqual({ success: false, error: 'SMTP connection timeout' });
      expect(result.resetToken).toBeUndefined();
      const tokenKey = mRedisClient.set.mock.calls[0][0];
      await vi.waitFor(() => {
        expect(mRedisClient.del).toHaveBeenCalledWith(tokenKey);
      });
    });
  });

  describe('resetPassword', () => {
    test('should throw UnauthorizedError if token is invalid or expired', async () => {
      mRedisClient.get.mockResolvedValue(null);

      await expect(resetPassword('invalid-token', 'NewSecurePass1')).rejects.toThrow(
        UnauthorizedError
      );
    });

    test('should update password and invalidate token if token is valid', async () => {
      mRedisClient.get.mockResolvedValue(mockUser.id);
      prisma.user.update.mockResolvedValue({ ...mockUser, passwordHash: 'new-hash' });
      mRedisClient.del.mockResolvedValue(1);

      const result = await resetPassword('valid-token', 'NewSecurePass123');

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
        }),
      });
      expect(mRedisClient.del).toHaveBeenCalledWith('pwd_reset:valid-token');
    });
  });
});
