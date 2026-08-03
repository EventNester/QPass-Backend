import { decodeToken } from "../../utils/jwt.utils.js";
import { getRedisClient } from "../../config/redis.js";
import { logger } from "../../config/index.js";
import { hashToken } from "../../utils/crypto.js";

const SESSION_PREFIX = 'session:';
const FALLBACK_TTL_SECONDS = 7 * 24 * 60 * 60;

function sessionKey(userId, sessionId) {
  return `${SESSION_PREFIX}${userId}:${sessionId}`;
}

function resolveTtl(refreshToken) {
  try {
    const decoded = decodeToken(refreshToken);
    if (decoded && typeof decoded.exp === 'number') {
      return Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // fall through to the default TTL
  }
  return FALLBACK_TTL_SECONDS;
}

/**
 * Persist a refresh token as an active session. Best-effort: a Redis failure
 * must never block the login/refresh response.
 *
 * @param {string} userId - Owning user id
 * @param {string} refreshToken - Raw refresh token (stored only as a hash)
 * @param {string|null} [userAgent] - Optional client user-agent
 * @returns {Promise<string|null>} The session id (token hash), or null on failure
 */
export async function recordSession(userId, refreshToken, userAgent = null) {
  try {
    const redis = getRedisClient();
    const sessionId = hashToken(refreshToken);
    const ttl = resolveTtl(refreshToken);

    await redis.set(
      sessionKey(userId, sessionId),
      JSON.stringify({
        userAgent: userAgent || null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      }),
      'EX',
      ttl
    );

    return sessionId;
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to record session');
    return null;
  }
}

/**
 * Check whether a refresh token corresponds to a live session.
 * @param {string} userId - Owning user id
 * @param {string} refreshToken - Raw refresh token
 * @returns {Promise<boolean>} True when the session exists
 */
export async function hasActiveSession(userId, refreshToken) {
  try {
    const redis = getRedisClient();
    const exists = await redis.exists(sessionKey(userId, hashToken(refreshToken)));
    return exists === 1;
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to check session');
    return false;
  }
}

/**
 * Atomically consume a refresh-token session. Only the first request wins:
 * the GETDEL removes the key, so concurrent requests carrying the same token
 * observe no session and are rejected during refresh.
 *
 * @param {string} userId - Owning user id
 * @param {string} refreshToken - Raw refresh token
 * @returns {Promise<boolean>} True when this request consumed a live session
 */
export async function consumeSession(userId, refreshToken) {
  try {
    const redis = getRedisClient();
    const raw = await redis.getdel(sessionKey(userId, hashToken(refreshToken)));
    return raw !== null;
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to consume session');
    return false;
  }
}

/**
 * Remove a session by its raw refresh token.
 * @param {string} userId - Owning user id
 * @param {string} refreshToken - Raw refresh token
 */
export async function deleteSession(userId, refreshToken) {
  try {
    const redis = getRedisClient();
    await redis.del(sessionKey(userId, hashToken(refreshToken)));
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to delete session');
  }
}

/**
 * List all active sessions for a user, newest first. Uses SCAN instead of
 * KEYS so large session sets never block the Redis event loop. Best-effort:
 * a Redis failure yields an empty list rather than rejecting the request.
 * @param {string} userId - Owning user id
 * @returns {Promise<Array<{id: string, userAgent: string|null, createdAt: string, expiresAt: string}>>}
 */
export async function listSessions(userId) {
  try {
    const redis = getRedisClient();
    const pattern = `${SESSION_PREFIX}${userId}:*`;

    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern);
      keys.push(...foundKeys);
      cursor = nextCursor;
    } while (cursor !== '0');

    const sessions = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      let meta = {};
      try {
        meta = raw ? JSON.parse(raw) : {};
      } catch {
        // treat unparseable metadata as an empty session
      }
      sessions.push({
        id: key.slice(key.lastIndexOf(':') + 1),
        userAgent: meta.userAgent || null,
        createdAt: meta.createdAt || null,
        expiresAt: meta.expiresAt || null,
      });
    }

    return sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to list sessions');
    return [];
  }
}

/**
 * Revoke a specific session by its id (the refresh-token hash).
 * @param {string} userId - Owning user id
 * @param {string} sessionId - Session id (token hash)
 */
export async function revokeSession(userId, sessionId) {
  try {
    const redis = getRedisClient();
    await redis.del(sessionKey(userId, sessionId));
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to revoke session');
  }
}

/**
 * Revoke all of a user's active sessions, optionally preserving one session
 * by its id (the refresh-token hash). Best-effort: failures are logged and
 * never block the caller.
 * @param {string} userId - Owning user id
 * @param {string|null} [excludeSessionId] - Session id to keep (usually the current request)
 */
export async function revokeAllSessions(userId, excludeSessionId = null) {
  const sessions = await listSessions(userId);
  for (const session of sessions) {
    if (session.id !== excludeSessionId) {
      await revokeSession(userId, session.id);
    }
  }
}
