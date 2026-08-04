import { Router } from 'express';
import {
  generateTokens,
  refreshToken,
  registerUser,
  authenticateUser,
  blacklistRefreshToken,
  hashPassword,
  getProfile,
  updateProfile,
  changePassword,
} from './auth.service.js';
import { forgotPassword, resetPassword } from './password.service.js';
import { requestEmailVerification, verifyEmail } from './verification.service.js';
import {
  recordSession,
  consumeSession,
  deleteSession,
  listSessions,
  revokeSession,
} from './session.service.js';
import { success, created } from '../../utils/response.js';
import { systemMessages } from '../../config/index.js';
import { ValidationError, UnauthorizedError } from '../../utils/error.js';

import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
  verifyEmailSchema,
  sessionParamsSchema,
} from './auth.schema.js';
import { requireAuth } from './auth.middleware.js';
import { authLimiter } from '../../middlewares/rate-limit.middleware.js';
import { verifyRefreshToken } from '../../utils/jwt.utils.js';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
} from './oauth.controller.js';

const router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account. The account is created as an ATTENDEE by
 *      default, or as an ORGANIZER/STAFF if a supported role is provided. Rate limited to 5 requests per 15 minutes.
 *      Password must be at least 8 characters, uppercase letter, lowercase letter, and contain a number.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       422:
 *         description: "Validation error. Possible messages: Name is required, Invalid email address, Password must be at least 8 characters, Password must contain an uppercase letter, Password must contain a lowercase letter, Password must contain a number, Invalid role (allowed roles: ATTENDEE, ORGANIZER, STAFF)"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    const { name, email, password, role } = parsed.data;

    const passwordHash = await hashPassword(password);
    const user = await registerUser({ name, email, passwordHash, role });

    const tokens = generateTokens(user);

    await recordSession(user.id, tokens.refreshToken, req.headers['user-agent'] || null);

    return created(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens }, systemMessages.SUCCESS.AUTH.REGISTER);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Authenticate a user
 *     description: Validates credentials and returns access + refresh tokens. Rate limited to 5 requests per 15 minutes.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: "Validation error. Possible messages: Invalid email address, Password is required"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    const { email, password } = parsed.data;

    const user = await authenticateUser(email, password);
    
    const tokens = generateTokens(user);

    await recordSession(user.id, tokens.refreshToken, req.headers['user-agent'] || null);

    return success(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens }, systemMessages.SUCCESS.AUTH.LOGIN);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/google:
 *   get:
 *     summary: Sign in / sign up with Google (start)
 *     description: |
 *       Redirects the browser to Google's consent screen. After the user approves,
 *       Google calls back to /api/v1/auth/google/callback which creates the account
 *       if it is new (sign-up) or signs the existing one in (sign-in), then redirects
 *       to the configured frontend dashboard URL with `access_token`, `refresh_token`
 *       and `mode` (signup|login) as query parameters.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *           enum: [ATTENDEE, ORGANIZER, STAFF]
 *         description: Role to assign when the Google account is created (defaults to ATTENDEE)
 *     responses:
 *       302:
 *         description: Redirect to Google consent screen
 *       422:
 *         description: "Validation error. Possible message: Invalid role"
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.get('/google', authLimiter, initiateGoogleAuth);

/**
 * @openapi
 * /api/v1/auth/google/callback:
 *   get:
 *     summary: Sign in / sign up with Google (callback)
 *     description: |
 *       Google redirects the browser here after consent. The code is exchanged for a
 *       profile, the account is created or matched, QPass tokens are issued, and the
 *       browser is redirected to `OAUTH_FRONTEND_REDIRECT_URL` (default:
 *       `FRONTEND_URL/pages/dashboard.html`) with `access_token`, `refresh_token` and
 *       `mode` query parameters. Failures redirect back with `error` and
 *       `error_description` instead.
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to the frontend dashboard (or back with an error param)
 */
router.get('/google/callback', handleGoogleCallback);

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Exchange a valid refresh token for a new access + refresh token pair. Old refresh token is blacklisted.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *       400:
 *         description: "Validation error. Possible message: Refresh token is required"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    const { refreshToken: token } = parsed.data;

    const decoded = verifyRefreshToken(token);

    // Atomic single-use session consumption: GETDEL removes the session key
    // before new tokens are issued, so a concurrent request reusing the same
    // refresh token is rejected (see consumeSession). The session is
    // deliberately destroyed before refreshToken() runs; if refreshToken()
    // fails after this point (blacklisted/invalid token, deleted user, or a
    // transient Redis/DB outage) the old session is already gone and the
    // client must re-authenticate. This is an accepted trade-off: the atomic
    // consume is what prevents refresh-token replay under concurrency.
    const consumed = await consumeSession(decoded.sub, token);
    if (!consumed) {
      throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_REFRESH_REVOKED);
    }

    const newTokens = await refreshToken(token);

    await recordSession(
      decoded.sub,
      newTokens.refreshToken,
      req.headers['user-agent'] || null
    );

    return success(res, newTokens, systemMessages.SUCCESS.AUTH.TOKEN_REFRESHED);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout a user
 *     description: Blacklists the refresh token so it cannot be used again.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LogoutRequest'
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       400:
 *         description: "Validation error. Possible message: Refresh token is required"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    await blacklistRefreshToken(parsed.data.refreshToken);
    await deleteSession(req.user.id, parsed.data.refreshToken);
    return success(res, null, systemMessages.SUCCESS.AUTH.LOGOUT);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     description: Sends a password reset link to the given email if an account exists.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Reset instructions sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: "Validation error. Possible message: Invalid email address"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    const result = await forgotPassword(parsed.data.email);
    return success(res, result, systemMessages.SUCCESS.AUTH.PASSWORD_RESET_SENT);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password with a reset token
 *     description: Accepts a reset token and new password to complete the password reset flow.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: "Validation error. Possible messages: Reset token is required, Password must be at least 8 characters, Password must contain an uppercase letter, Password must contain a lowercase letter, Password must contain a number"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired reset token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    return success(res, null, systemMessages.SUCCESS.AUTH.PASSWORD_RESET_SUCCESS);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Returns the authenticated user's profile details.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const profile = await getProfile(req.user.id);
    return success(res, profile);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/me:
 *   patch:
 *     summary: Update current user profile
 *     description: Updates the authenticated user's name and/or phone number.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: "Validation error. Possible messages: Name is required, Name must be at most 100 characters, Invalid phone number format"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    const profile = await updateProfile(req.user.id, parsed.data);
    return success(res, profile, systemMessages.SUCCESS.AUTH.PROFILE_UPDATED);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change current user password
 *     description: Verifies the current password and sets a new one. Rate limited to 5 requests per 15 minutes.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: "Validation error. Possible messages: Current password is required, Password must be at least 8 characters, Password must contain an uppercase letter, Password must contain a lowercase letter, Password must contain a number"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing Bearer token, or current password is incorrect
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/change-password', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    await changePassword(req.user.id, parsed.data.currentPassword, parsed.data.newPassword);
    return success(res, null, systemMessages.SUCCESS.AUTH.PASSWORD_CHANGED);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/request-verification:
 *   post:
 *     summary: Request an email verification email
 *     description: Sends a verification email to the authenticated user. Rate limited to 5 requests per 15 minutes.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent
 *       400:
 *         description: Email is already verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/request-verification', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const profile = await getProfile(req.user.id);
    if (profile.emailVerifiedAt) {
      return next(new ValidationError(systemMessages.ERROR.AUTH.EMAIL_ALREADY_VERIFIED));
    }
    const result = await requestEmailVerification({ id: profile.id, email: profile.email });
    if (result && result.success === false) {
      return next(new Error(systemMessages.ERROR.EMAIL.FAILED));
    }
    return success(res, result, systemMessages.SUCCESS.AUTH.VERIFICATION_SENT);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/verify-email:
 *   post:
 *     summary: Verify email with a token
 *     description: Completes email verification using the token emailed to the user. Rate limited to 5 requests per 15 minutes.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Email verification token
 *             required: [token]
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: "Validation error. Possible message: Verification token is required"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired verification token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post('/verify-email', authLimiter, async (req, res, next) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    await verifyEmail(parsed.data.token);
    return success(res, null, systemMessages.SUCCESS.AUTH.EMAIL_VERIFIED);
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/sessions:
 *   get:
 *     summary: List active sessions
 *     description: Lists all active refresh-token sessions for the authenticated user.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions listed successfully
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await listSessions(req.user.id);
    return success(res, { sessions });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke a session
 *     description: Revokes a specific session by its id, forcing the client to log in again.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           description: Session id (64-char hex refresh-token hash)
 *     responses:
 *       200:
 *         description: Session revoked successfully
 *       400:
 *         description: "Validation error. Possible messages: Session id is required, Invalid session id"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/sessions/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const parsed = sessionParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.issues[0].message));
    }
    await revokeSession(req.user.id, parsed.data.sessionId);
    return success(res, null, systemMessages.SUCCESS.AUTH.SESSION_REVOKED);
  } catch (error) {
    return next(error);
  }
});

export default router;

