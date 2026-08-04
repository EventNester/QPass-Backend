import { describe, test, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
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

  const BINDING = 'test-binding-123';
  const bindingHash = crypto.createHash('sha256').update(BINDING).digest('hex');
  const PKCE_VERIFIER = 'test-pkce-verifier';

  const cookieReq = () => ({ headers: { cookie: `oauth_binding=${BINDING}; session=abc` } });
  const storedRecord = (role, overrides = {}) =>
    JSON.stringify({ role, bindingHash, pkceVerifier: PKCE_VERIFIER, ...overrides });

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
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('code_challenge=');

      const setCall = mRedisClient.set.mock.calls[0];
      expect(setCall[0]).toMatch(/^oauth_state:[a-f0-9]{64}$/);
      const stored = JSON.parse(setCall[1]);
      expect(stored.role).toBe('ORGANIZER');
      expect(stored.bindingHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.pkceVerifier).toEqual(expect.any(String));
      expect(setCall[2]).toBe('EX');
      expect(setCall[3]).toBe(600);
    });

    test('should default the sign-up role to ATTENDEE', async () => {
      await initiateGoogleOAuth({ role: 'ADMIN' });
      const stored = JSON.parse(mRedisClient.set.mock.calls[0][1]);
      expect(stored.role).toBe('ATTENDEE');
      expect(mRedisClient.set.mock.calls[0][2]).toBe('EX');
    });

    test('should set the browser-binding cookie when a response is provided', async () => {
      const res = { cookie: vi.fn() };
      await initiateGoogleOAuth({ role: 'ATTENDEE' }, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'oauth_binding',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 600 * 1000,
        })
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
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
    });

    test('should include the PKCE code_verifier when provided', async () => {
      axios.post.mockResolvedValue({ data: googleTokenResponse });

      await exchangeCodeForTokens('auth-code', PKCE_VERIFIER);

      expect(axios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.stringContaining(`code_verifier=${PKCE_VERIFIER}`),
        expect.anything()
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
        timeout: 10000,
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

    test('should sign in an existing active user, preserving the stored name', async () => {
      const existing = {
        id: 'user-1',
        name: 'Original Name',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerifiedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, lastLoginAt: new Date() });

      const result = await findOrCreateGoogleUser(profile, 'ATTENDEE');

      expect(result.isNewUser).toBe(false);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          name: 'Original Name',
          lastLoginAt: expect.any(Date),
        }),
      });
    });

    test('should apply the Google name only when the existing account has no stored name', async () => {
      const existing = {
        id: 'user-1',
        name: '',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerifiedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, name: 'Jane Doe' });

      await findOrCreateGoogleUser(profile, 'ATTENDEE');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ name: 'Jane Doe' }),
      });
    });

    test('should reactivate a soft-deleted account, preserving name and setting status to ACTIVE', async () => {
      const deleted = {
        id: 'user-1',
        name: 'Original Name',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'INACTIVE',
        deletedAt: new Date(),
        emailVerifiedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(deleted);
      prisma.user.update.mockResolvedValue({ ...deleted, deletedAt: null, status: 'ACTIVE' });

      const result = await findOrCreateGoogleUser(profile, 'ATTENDEE');

      expect(result.isNewUser).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          deletedAt: null,
          status: 'ACTIVE',
          name: 'Original Name',
        }),
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

    test('should reject a suspended account even when soft-deleted', async () => {
      const suspendedDeleted = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'ATTENDEE',
        status: 'SUSPENDED',
        deletedAt: new Date(),
        emailVerifiedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(suspendedDeleted);

      await expect(findOrCreateGoogleUser(profile, 'ATTENDEE')).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('completeGoogleOAuth', () => {
    test('should throw BadRequestError when the binding cookie is missing', async () => {
      await expect(
        completeGoogleOAuth({ code: 'code', state: 'state-1', userAgent: null }, { headers: {} })
      ).rejects.toThrow(systemMessages.ERROR.AUTH.GOOGLE_STATE_INVALID);
      expect(mRedisClient.getdel).not.toHaveBeenCalled();
    });

    test('should throw BadRequestError when the binding hash does not match', async () => {
      mRedisClient.getdel.mockResolvedValue(
        storedRecord('ATTENDEE', { bindingHash: 'a'.repeat(64) })
      );

      await expect(
        completeGoogleOAuth({ code: 'code', state: 'state-1', userAgent: null }, cookieReq())
      ).rejects.toThrow(systemMessages.ERROR.AUTH.GOOGLE_STATE_INVALID);
    });

    test('should throw BadRequestError for an invalid or expired state', async () => {
      mRedisClient.getdel.mockResolvedValue(null);

      await expect(
        completeGoogleOAuth({ code: 'code', state: 'bogus', userAgent: null }, cookieReq())
      ).rejects.toThrow(systemMessages.ERROR.AUTH.GOOGLE_STATE_INVALID);
    });

    test('should sign up a new user and issue QPass tokens', async () => {
      mRedisClient.getdel.mockResolvedValue(storedRecord('ORGANIZER'));
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

      const result = await completeGoogleOAuth(
        { code: 'code', state: 'state-1', userAgent: null },
        cookieReq()
      );

      expect(result.isNewUser).toBe(true);
      expect(result.accessToken).toBe('access-token-123');
      expect(result.refreshToken).toBe('refresh-token-123');
      expect(result.user).toEqual(created);
      expect(generateTokens).toHaveBeenCalledWith(created);
      expect(recordSession).toHaveBeenCalledWith('user-1', 'refresh-token-123', null);
      expect(axios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.stringContaining(`code_verifier=${PKCE_VERIFIER}`),
        expect.anything()
      );
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'ORGANIZER' }),
      });
    });

    test('should sign in an existing user and mark it as login', async () => {
      mRedisClient.getdel.mockResolvedValue(storedRecord('ATTENDEE'));
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

      const result = await completeGoogleOAuth(
        { code: 'code', state: 'state-2', userAgent: 'ua' },
        cookieReq()
      );

      expect(result.isNewUser).toBe(false);
      expect(result.accessToken).toBe('access-token-123');
      expect(recordSession).toHaveBeenCalledWith('user-1', 'refresh-token-123', 'ua');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
