import { Router } from "express";

const router = Router();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user account
 *     description: Creates a new user with role `ATTENDEE` by default and returns a JWT pair.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (rate limit)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/register", (req, res) => {
  res.status(501).json({ status: 'error', message: 'Not implemented' });
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in with email + password
 *     description: Returns a fresh access + refresh token pair on success.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials or suspended account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 attempts per 15 minutes)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", (req, res) => {
  res.status(501).json({ status: 'error', message: 'Not implemented' });
});

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new token pair
 *     description: |
 *       Rotates the refresh token. The old refresh token is invalidated
 *       server-side, so this endpoint can be safely replayed only with the
 *       most recently issued refresh token.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: New token pair
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Refresh token invalid, expired, or revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/refresh", (req, res) => {
  res.status(501).json({ status: 'error', message: 'Not implemented' });
});

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     description: Idempotent — succeeds even if the token is already invalid or expired.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LogoutRequest'
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: Logged out successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     success: { type: boolean, example: true }
 */
router.post("/logout", (req, res) => {
  res.status(501).json({ status: 'error', message: 'Not implemented' });
});

export default router;
