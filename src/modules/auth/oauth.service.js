import crypto from 'crypto';
import axios from 'axios';
import prisma from '../../database/index.js';
import { getConfig, systemMessages, logger } from '../../config/index.js';
import { getRedisClient } from '../../config/redis.js';
import { BadRequestError, UnauthorizedError } from '../../utils/error.js';
import { writeAuditLog } from '../../utils/audit-log.js';
import { generateTokens, hashPassword } from './auth.service.js';
import { recordSession } from './session.service.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const OAUTH_STATE_PREFIX = 'oauth_state:';
const OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes
const OAUTH_BINDING_COOKIE = 'oauth_binding';

const FALLBACK_CALLBACK_URL = 'http://localhost:3000/api/v1/auth/google/callback';

const SUPPORTED_ROLES = new Set(['ATTENDEE', 'ORGANIZER', 'STAFF']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function readCookie(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Resolve Google OAuth settings. The callback URL and the post-auth redirect
 * fall back to development-friendly defaults so the flow works out of the box;
 * production deployments should set them explicitly.
 *
 * @returns {{ clientId: string, clientSecret: string, callbackUrl: string, frontendRedirectUrl: string }}
 * @throws {BadRequestError} If Google OAuth is not configured
 */
export function getOAuthConfig() {
  const config = getConfig();
  const clientId = config.GOOGLE_CLIENT_ID;
  const clientSecret = config.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new BadRequestError(systemMessages.ERROR.AUTH.GOOGLE_NOT_CONFIGURED);
  }

  return {
    clientId,
    clientSecret,
    callbackUrl: config.GOOGLE_CALLBACK_URL || FALLBACK_CALLBACK_URL,
    frontendRedirectUrl:
      config.OAUTH_FRONTEND_REDIRECT_URL ||
      `${config.FRONTEND_URL || 'http://localhost:3000'}/pages/dashboard.html`,
  };
}

/**
 * Persist the OAuth state token so the callback can prove it was initiated by
 * this server, recover the requested sign-up role, verify the browser binding
 * and complete the PKCE exchange. Best-effort.
 *
 * @param {string} state - Random state token
 * @param {{ role: string, bindingHash: string, pkceVerifier: string }} record - State record
 */
async function storeOAuthState(state, record) {
  const redis = getRedisClient();
  await redis.set(
    `${OAUTH_STATE_PREFIX}${state}`,
    JSON.stringify(record),
    'EX',
    OAUTH_STATE_TTL_SECONDS
  );
}

/**
 * Atomically consume an OAuth state token (single use). Returns null when the
 * token is unknown or already used.
 *
 * @param {string} state - State token from the callback
 * @returns {Promise<{ role: string, bindingHash: string, pkceVerifier: string } | null>}
 */
async function consumeOAuthState(state) {
  const redis = getRedisClient();
  const raw = await redis.getdel(`${OAUTH_STATE_PREFIX}${state}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Build the Google consent URL for the given role, persist the CSRF state bound
 * to the initiating browser and add a PKCE challenge.
 *
 * @param {{ role?: string }} [options] - Optional sign-up role
 * @param {import('express').Response} [res] - Express response, used to set the browser-binding cookie
 * @returns {Promise<string>} The Google authorization URL to redirect the browser to
 */
export async function initiateGoogleOAuth({ role } = {}, res) {
  const { clientId, callbackUrl } = getOAuthConfig();

  const state = crypto.randomBytes(32).toString('hex');
  const binding = crypto.randomBytes(32).toString('hex');
  const pkceVerifier = crypto.randomBytes(32).toString('base64url');

  await storeOAuthState(state, {
    role: SUPPORTED_ROLES.has(role) ? role : 'ATTENDEE',
    bindingHash: sha256(binding),
    pkceVerifier,
  });

  if (res && typeof res.cookie === 'function') {
    res.cookie(OAUTH_BINDING_COOKIE, binding, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: pkceChallenge(pkceVerifier),
    code_challenge_method: 'S256',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange the Google authorization code for access/ID tokens.
 * @param {string} code - Authorization code from the callback
 * @param {string} [pkceVerifier] - PKCE verifier issued during initiation
 * @returns {Promise<Object>} Google token response
 */
const GOOGLE_HTTP_TIMEOUT_MS = 10_000;

export async function exchangeCodeForTokens(code, pkceVerifier) {
  const { clientId, clientSecret, callbackUrl } = getOAuthConfig();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl,
    grant_type: 'authorization_code',
  });
  if (pkceVerifier) {
    body.set('code_verifier', pkceVerifier);
  }

  const response = await axios.post(
    GOOGLE_TOKEN_URL,
    body.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
    }
  );

  return response.data;
}

/**
 * Fetch the authenticated Google profile using an access token.
 * @param {string} accessToken - Google access token.
 * @returns {Promise<{ sub: string, name: string, email: string, email_verified: boolean, picture?: string }>}
 */
export async function fetchGoogleUser(accessToken) {
  const response = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
  return response.data;
}

/**
 * Find an existing account by email or create a new one from a verified Google
 * profile. New accounts get a random unusable password hash so the credentials
 * login path can never be used, and an ATTENDEE role unless one was requested.
 *
 * @param {Object} profile - Verified Google profile
 * @param {string} role - Role for new sign-ups
 * @returns {Promise<{ user: Object, isNewUser: boolean }>}
 * @throws {UnauthorizedError} If the email is not verified or the account is suspended
 */
export async function findOrCreateGoogleUser(profile, role) {
  const email = profile.email ? profile.email.toLowerCase() : '';
  if (!email || profile.email_verified !== true) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.GOOGLE_EMAIL_NOT_VERIFIED);
  }

  const name = profile.name || email.split('@')[0];
  const now = new Date();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Reject suspended accounts before any reactivation, so a suspended
    // soft-deleted user can never receive tokens via Google sign-in.
    if (existing.status === 'SUSPENDED') {
      throw new UnauthorizedError(systemMessages.ERROR.AUTH.ACCOUNT_SUSPENDED);
    }

    if (existing.deletedAt) {
      // Re-activate a soft-deleted account instead of re-registering it.
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          status: 'ACTIVE',
          name: existing.name || name,
          emailVerifiedAt: existing.emailVerifiedAt || now,
          lastLoginAt: now,
        },
      });
      writeAuditLog({
        actorId: user.id,
        action: 'USER_REACTIVATED',
        entity: 'User',
        entityId: user.id,
        afterSnapshot: { provider: 'google' },
      });
      return { user, isNewUser: true };
    }

    // Keep an existing account's stored name unless it has none; do not
    // overwrite a curated display name with the Google-provided one.
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: existing.name || name,
        emailVerifiedAt: existing.emailVerifiedAt || now,
        lastLoginAt: now,
      },
    });
    return { user, isNewUser: false };
  }

  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: SUPPORTED_ROLES.has(role) ? role : 'ATTENDEE',
      emailVerifiedAt: now,
      lastLoginAt: now,
    },
  });
  return { user, isNewUser: true };
}

/**
 * Complete the Google OAuth flow: validate state and the browser-binding cookie,
 * exchange the code, resolve the account (sign-up or sign-in), issue QPass
 * tokens and record the session.
 *
 * @param {{ code: string, state: string, userAgent: string|null }} payload - Callback payload
 * @param {import('express').Request} req - Express request, used to read the binding cookie
 * @returns {Promise<{ user: Object, accessToken: string, refreshToken: string, isNewUser: boolean }>}
 */
export async function completeGoogleOAuth({ code, state, userAgent }, req) {
  const binding = readCookie(req, OAUTH_BINDING_COOKIE);
  if (!binding) {
    throw new BadRequestError(systemMessages.ERROR.AUTH.GOOGLE_STATE_INVALID);
  }

  const stored = await consumeOAuthState(state);
  if (!stored || stored.bindingHash !== sha256(binding)) {
    throw new BadRequestError(systemMessages.ERROR.AUTH.GOOGLE_STATE_INVALID);
  }

  const googleTokens = await exchangeCodeForTokens(code, stored.pkceVerifier);
  if (!googleTokens?.access_token) {
    throw new BadRequestError(systemMessages.ERROR.AUTH.GOOGLE_OAUTH_FAILED);
  }
  const profile = await fetchGoogleUser(googleTokens.access_token);

  const { user, isNewUser } = await findOrCreateGoogleUser(profile, stored.role);

  await writeAuditLog({
    actorId: user.id,
    action: isNewUser ? 'USER_OAUTH_SIGNUP' : 'USER_OAUTH_LOGIN',
    entity: 'User',
    entityId: user.id,
    afterSnapshot: { provider: 'google', email: user.email, role: user.role },
  }).catch((err) => logger.warn({ err: err.message }, 'OAuth audit log failed'));

  const tokens = generateTokens(user);
  await recordSession(user.id, tokens.refreshToken, userAgent || null);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    ...tokens,
    isNewUser,
  };
}
