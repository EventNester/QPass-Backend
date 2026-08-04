import { describe, test, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  getOAuthConfig,
  initiateGoogleOAuth,
  exchangeCodeForTokens,
  fetchGoogleUser,
  findOrCreateGoogleUser,
  completeGoogleOAuth,
} from '../oauth.service.js';
import { BadRequestError, UnauthorizedError } from '../../../utils/error.js';
import { systemMessages, getConfig } from '../../../config/index.js';
import prisma from '../../../database/index.js';
import { generateTokens, hashPassword } from '../auth.service.js';
import { recordSession } from '../session.service.js';

vi.mock('../../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/v1/auth/google/callback',
    OAUTH_FRONTEND_REDIRECT_URL: '',
    FRONTEND_URL: 'http://localhost:3000',
  })),
  systemMessages: {
    ERROR: {
      AUTH: {
        GOOGLE_NOT_CONFIGURED: 'Google OAuth is not configured on the server',
        GOOGLE_STATE_INVALID: 'Google sign-in session expired or is invalid, please try again',
        GOOGLE_EMAIL_NOT_VERIFIED: 'Your Google account email is not verified',
        ACCOUNT_SUSPENDED: 'Account has been suspended',
      },
    },
  },
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mRedisClient = {
  set: vi.fn(),
  getdel: vi.fn(),
};
vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mRedisClient),
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('../../../utils/audit-log.js', () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock('../auth.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateTokens: vi.fn(() => ({
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-123',
    })),
    hashPassword: vi.fn(() => Promise.resolve('hashed-random-password')),
  };
});

vi.mock('../session.service.js', () => ({
  recordSession: vi.fn(() => Promise.resolve('session-id-123')),
}));

describe('OAuth Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const profile = {
    sub: 'google-sub-123',
    name: 'Jane Doe',
    email: 'jane@example.com',
    email_verified: true,
  };

  const googleTokenResponse = {
    access_token: 'google-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: 'google-id-token',
  };

  describe('getOAuthConfig', () => {
    test('should throw BadRequestError when Google is not configured', () => {
      vi.mocked(getConfig).mockReturnValueOnce({
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_CALLBACK_URL: '',
        OAUTH_FRONTEND_REDIRECT_URL: '',
        FRONTEND_URL: 'http://localhost:3000',
      });

      let error;
      try {
        getOAuthConfig();
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe(systemMessages.ERROR.AUTH.GOOGLE_NOT_CONFIGURED);
    });
  });

  describe('initiateGoogleOAuth', () => {
    test('should build a Google authorization URL and store state', async () => {
      const url = await initiateGoogleOAuth({ role: 'ORGANIZER' });

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=openid+email+profile');
      expect(url).toContain('state=');

      expect(mRedisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth_state:[a-f0-9]{64}$/),
        JSON.stringify({ role: 'ORGANIZER' }),
        'EX',
        600
      );
    });

    test('should default the sign-up role to ATTENDEE', async () => {
      await initiateGoogleOAuth({ role: 'ADMIN' });
      expect(mRedisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth_state:/),
        JSON.stringify({ role: 'ATTENDEE' }),
        'EX',
        600
      );
    });
  });

  describe('exchangeCodeForTokens', () => {
    test('should POST the authorization code to the Google token endpoint', async () => {
      axios.post.mockResolvedValue({ data: googleTokenResponse });

      const result = await exchangeCodeForTokens('auth-code');

      expect(result).toEqual(googleTokenResponse);
      expect(axios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.stringContaining('code=auth-code'),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    });
  });

  describe('fetchGoogleUser', () => {
    test('should fetch the Google profile with a bearer token', async () => {
      axios.get.mockResolvedValue({ data: profile });

      const result = await fetchGoogleUser('google-access-token');

      expect(result).toEqual(profile);
      expect(axios.get).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer google-access-token' },
      });
    });
  });

  describe('findOrCreateGoogleUser', () => {
    test('should create a new user for an unverified-free profile (sign-up)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      };
      prisma.user.create.mockResolvedValue(created);

      const result = await findOrCreateGoogleUser(profile, 'ATTENDEE');

      expect(result.isNewUser).toBe(true);
      expect(result.user).toEqual(created);
      expect(hashPassword).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: 'ATTENDEE',
          passwordHash: 'hashed-random-password',
          emailVerifiedAt: expect.any(Date),
        }),
      });
    });

    test('should sign in an existing active user (login)', async () => {
      const existing = {
        id: 'user-1',
        name: 'Old Name',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerifiedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, name: 'Jane Doe' });

      const result = await findOrCreateGoogleUser(profile, 'ATTENDEE');

      expect(result.isNewUser).toBe(false);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          name: 'Jane Doe',
          lastLoginAt: expect.any(Date),
        }),
      });
    });

    test('should reactivate a soft-deleted account', async () => {
      const deleted = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'ACTIVE',
        deletedAt: new Date(),
        emailVerifiedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(deleted);
      prisma.user.update.mockResolvedValue({ ...deleted, deletedAt: null });

      const result = await findOrCreateGoogleUser(profile, 'ATTENDEE');

      expect(result.isNewUser).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ deletedAt: null }),
      });
    });

    test('should reject an unverified Google email', async () => {
      await expect(
        findOrCreateGoogleUser({ ...profile, email_verified: false }, 'ATTENDEE')
      ).rejects.toThrow(systemMessages.ERROR.AUTH.GOOGLE_EMAIL_NOT_VERIFIED);
    });

    test('should reject a suspended account', async () => {
      const suspended = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'SUSPENDED',
        deletedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(suspended);

      await expect(findOrCreateGoogleUser(profile, 'ATTENDEE')).rejects.toBeInstanceOf(
        UnauthorizedError
      );
    });
  });

  describe('completeGoogleOAuth', () => {
    test('should throw BadRequestError for an invalid or expired state', async () => {
      mRedisClient.getdel.mockResolvedValue(null);

      await expect(
        completeGoogleOAuth({ code: 'code', state: 'bogus', userAgent: null })
      ).rejects.toThrow(systemMessages.ERROR.AUTH.GOOGLE_STATE_INVALID);
    });

    test('should sign up a new user and issue QPass tokens', async () => {
      mRedisClient.getdel.mockResolvedValue(JSON.stringify({ role: 'ORGANIZER' }));
      axios.post.mockResolvedValue({ data: googleTokenResponse });
      axios.get.mockResolvedValue({ data: profile });
      prisma.user.findUnique.mockResolvedValue(null);
      const created = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'ORGANIZER',
      };
      prisma.user.create.mockResolvedValue(created);

      const result = await completeGoogleOAuth({ code: 'code', state: 'state-1', userAgent: null });

      expect(result.isNewUser).toBe(true);
      expect(result.accessToken).toBe('access-token-123');
      expect(result.refreshToken).toBe('refresh-token-123');
      expect(result.user).toEqual(created);
      expect(generateTokens).toHaveBeenCalledWith(created);
      expect(recordSession).toHaveBeenCalledWith('user-1', 'refresh-token-123', null);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'ORGANIZER' }),
      });
    });

    test('should sign in an existing user and mark it as login', async () => {
      mRedisClient.getdel.mockResolvedValue(JSON.stringify({ role: 'ATTENDEE' }));
      axios.post.mockResolvedValue({ data: googleTokenResponse });
      axios.get.mockResolvedValue({ data: profile });
      const existing = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerifiedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, lastLoginAt: new Date() });

      const result = await completeGoogleOAuth({ code: 'code', state: 'state-2', userAgent: 'ua' });

      expect(result.isNewUser).toBe(false);
      expect(result.accessToken).toBe('access-token-123');
      expect(recordSession).toHaveBeenCalledWith('user-1', 'refresh-token-123', 'ua');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
