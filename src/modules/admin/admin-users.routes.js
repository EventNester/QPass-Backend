import { Router } from "express";

import {
  sendAdminInviteController,
  acceptAdminInviteController,
  promoteAdminController,
} from "./admin-users.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { authLimiter } from "../../middlewares/rate-limit.middleware.js";
import { validate, validateParams } from "../../middlewares/validate.middleware.js";
import {
  adminInviteSchema,
  adminInviteParamsSchema,
  acceptAdminInviteSchema,
  adminUserParamsSchema,
} from "./admin-users.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/admin/invites:
 *   post:
 *     summary: Invite a user to become an admin
 *     description: |
 *       Sends an email with a single-use invite link. The invitee sets their own
 *       password when they accept, so the inviting admin never sees it. Cannot be
 *       used for an email that already belongs to a non-admin account — use
 *       PATCH /admin/users/{userId}/promote for those. ADMIN role only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminInviteRequest'
 *     responses:
 *       201:
 *         description: Admin invitation sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller must be an ADMIN
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A user with this email already exists (or is already an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: "Validation error. Possible message: Invalid email address"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/invites",
  requireAuth,
  requireRole("ADMIN"),
  validate(adminInviteSchema),
  sendAdminInviteController
);

/**
 * @openapi
 * /api/v1/admin/invites/{token}/accept:
 *   post:
 *     summary: Accept an admin invitation
 *     description: |
 *       Completes the invite flow: the invitee sets their name and password, and
 *       an ADMIN account is created (or a previously deleted account with that
 *       email is reactivated as an ADMIN). Invite tokens are single-use and
 *       expire after 7 days. Rate limited to 5 requests per 15 minutes.
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token from the invitation email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AcceptAdminInviteRequest'
 *     responses:
 *       200:
 *         description: Admin invitation accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Invalid or expired invitation token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A user with this email already exists (or is already an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: "Validation error. Possible messages: Name is required, Invitation token is required, Password must be at least 8 characters, Password must contain an uppercase letter, Password must contain a lowercase letter, Password must contain a number"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests (5 per 15 min)
 */
router.post(
  "/invites/:token/accept",
  authLimiter,
  validateParams(adminInviteParamsSchema),
  validate(acceptAdminInviteSchema),
  acceptAdminInviteController
);

/**
 * @openapi
 * /api/v1/admin/users/{userId}/promote:
 *   patch:
 *     summary: Promote a user to admin
 *     description: |
 *       Changes an existing user's role to ADMIN. Idempotent — promoting an
 *       existing ADMIN succeeds without changes. Cannot be used on your own
 *       account. ADMIN role only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to promote
 *     responses:
 *       200:
 *         description: User promoted to admin successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller must be an ADMIN, or cannot change your own role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: "Validation error. Possible message: Invalid user ID format"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  "/users/:userId/promote",
  requireAuth,
  requireRole("ADMIN"),
  validateParams(adminUserParamsSchema),
  promoteAdminController
);

export default router;
