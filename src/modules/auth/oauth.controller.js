import { constants, systemMessages, logger } from '../../config/index.js';
import {
  initiateGoogleOAuth,
  completeGoogleOAuth,
  getOAuthConfig,
} from './oauth.service.js';
import { ValidationError } from '../../utils/error.js';

const SUPPORTED_ROLES = new Set([
  constants.ROLES.ATTENDEE,
  constants.ROLES.ORGANIZER,
  constants.ROLES.STAFF,
]);

/**
 * Redirect the browser to the Google consent screen. An optional `role` query
 * param lets a sign-up flow create the account as ORGANIZER or STAFF.
 */
export async function initiateGoogleAuth(req, res, next) {
  try {
    const role = req.query.role ? String(req.query.role).toUpperCase() : undefined;
    if (role && !SUPPORTED_ROLES.has(role)) {
      return next(new ValidationError(systemMessages.VALIDATION.INVALID_ROLE));
    }

    const authUrl = await initiateGoogleOAuth({ role });
    return res.redirect(authUrl);
  } catch (error) {
    return next(error);
  }
}

function redirectToFrontend(res, errorCode, errorDescription) {
  let frontendRedirectUrl;
  try {
    ({ frontendRedirectUrl } = getOAuthConfig());
  } catch {
    // Not configured: fall back to the raw FRONTEND_URL so the user still
    // lands on the app and sees the error, rather than a JSON page.
    frontendRedirectUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  const params = new URLSearchParams({ error: errorCode, error_description: errorDescription });
  return res.redirect(`${frontendRedirectUrl}?${params.toString()}`);
}

/**
 * Google redirects the browser here after consent. On success the user is
 * signed in/signed up and the browser is redirected to the frontend dashboard
 * with the QPass access + refresh tokens as query parameters.
 */
export async function handleGoogleCallback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return redirectToFrontend(res, 'google_oauth_failed', errorDescription || error);
  }

  if (!code || !state) {
    return redirectToFrontend(res, 'invalid_request', 'Missing authorization code or state');
  }

  try {
    const result = await completeGoogleOAuth({
      code,
      state,
      userAgent: req.headers['user-agent'] || null,
    });

    const params = new URLSearchParams({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      mode: result.isNewUser ? 'signup' : 'login',
    });

    const { frontendRedirectUrl } = getOAuthConfig();
    return res.redirect(`${frontendRedirectUrl}?${params.toString()}`);
  } catch (err) {
    logger.warn({ err: err.message }, 'Google OAuth callback failed');
    return redirectToFrontend(res, 'google_oauth_failed', err.message);
  }
}
