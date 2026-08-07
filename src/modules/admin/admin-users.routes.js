import { Router } from "express";

import {
  sendAdminInviteController,
  acceptAdminInviteController,
  promoteAdminController,
  listUsersController,
  deactivateUserController,
} from "./admin-users.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { authLimiter } from "../../middlewares/rate-limit.middleware.js";
import { validate, validateParams, validateQuery } from "../../middlewares/validate.middleware.js";
import {
  adminInviteSchema,
  adminInviteParamsSchema,
  acceptAdminInviteSchema,
  adminUserParamsSchema,
  listUsersQuerySchema,
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
 *         description: A non-deleted (active) user with this email already exists (or is already an admin)
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
 *         description: A non-deleted (active) user already exists with this email (or is already an admin). Previously deleted accounts with this email are reactivated instead of returning 409.
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

/**
 * @openapi
 * /api/v1/admin/users:
 *   get:
 *     summary: List users for the directory
 *     description: |
 *       Returns the registered users directory (paginated, optional search).
 *       Only real accounts from the users table are returned; "derived" rows
 *       (actors inferred from audit logs / event owners) are never produced, so
 *       every listed user can be deactivated. ADMIN role only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Results per page (default 20, max 100)
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by name or email (case-insensitive)
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *       403:
 *         description: Forbidden — caller must be an ADMIN
 *       422:
 *         description: "Validation error. Possible message: Invalid page, limit, or search parameter"
 */
router.get(
  "/users",
  requireAuth,
  requireRole("ADMIN"),
  validateQuery(listUsersQuerySchema),
  listUsersController
);

/**
 * @openapi
 * /api/v1/admin/users/{userId}/deactivate:
 *   post:
 *     summary: Deactivate a user account
 *     description: |
 *       Sets a user's status to INACTIVE so they can no longer sign in or act.
 *       Cannot be used on your own account. Idempotent — deactivating an already
 *       INACTIVE user succeeds without changes. Failed for any id that references
 *       no real account (e.g. a frontend "derived" row) with 404. ADMIN role only.
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
 *         description: User ID to deactivate
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *       403:
 *         description: Forbidden — caller must be an ADMIN, or cannot deactivate your own account
 *       404:
 *         description: User not found
 *       422:
 *         description: "Validation error. Possible message: Invalid user ID format"
 */
router.post(
  "/users/:userId/deactivate",
  requireAuth,
  requireRole("ADMIN"),
  validateParams(adminUserParamsSchema),
  deactivateUserController
);

export default router;
