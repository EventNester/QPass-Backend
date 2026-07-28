import { Router } from 'express';
import { generateTokens, refreshToken, registerUser, authenticateUser, blacklistRefreshToken, hashPassword } from './auth.service.js';
import { forgotPassword, resetPassword } from './password.service.js';
import { success, created } from '../../utils/response.js';
import { systemMessages } from '../../config/index.js';

import { registerSchema, loginSchema, refreshSchema, logoutSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema.js';
import { requireAuth } from './auth.middleware.js';
import { authLimiter } from '../../middlewares/rate-limit.middleware.js';

const router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account with ATTENDEE role. Rate limited to 5 requests per 15 minutes. 
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
 *       400:
 *         description: "Validation error. Possible messages: Name is required, Invalid email address, Password must be at least 8 characters, Password must contain an uppercase letter, Password must contain a lowercase letter, Password must contain a number"
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
      return res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    }
    const { name, email, password } = parsed.data;

    const passwordHash = await hashPassword(password);
    const user = await registerUser({ name, email, passwordHash, role: 'ATTENDEE' });

    const tokens = generateTokens(user);

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
      return res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    }
    const { email, password } = parsed.data;

    const user = await authenticateUser(email, password);
    
    const tokens = generateTokens(user);

    return success(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens }, systemMessages.SUCCESS.AUTH.LOGIN);
  } catch (error) {
    next(error);
  }
});

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
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
    }
    const { refreshToken: token } = parsed.data;

    const newTokens = await refreshToken(token);
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
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
    }
    await blacklistRefreshToken(parsed.data.refreshToken);
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
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
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
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    return success(res, null, systemMessages.SUCCESS.AUTH.PASSWORD_RESET_SUCCESS);
  } catch (error) {
    return next(error);
  }
});

export default router;

