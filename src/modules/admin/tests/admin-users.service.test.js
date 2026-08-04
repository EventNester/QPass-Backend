import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  sendAdminInvite,
  acceptAdminInvite,
  promoteToAdmin,
} from "../admin-users.service.js";
import prisma from "../../../database/index.js";
import { sendAdminInviteEmail } from "../../../utils/email.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../../utils/error.js";

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

const mockRedis = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock("../../../database/index.js", () => ({
  default: mockPrisma,
}));

vi.mock("../../../config/index.js", () => ({
  constants: {
    ROLES: {
      ATTENDEE: "ATTENDEE",
      STAFF: "STAFF",
      ORGANIZER: "ORGANIZER",
      ADMIN: "ADMIN",
    },
  },
  systemMessages: {
    ERROR: {
      ADMIN: {
        USER_NOT_FOUND: "User not found",
        USER_ALREADY_EXISTS: "A user with this email already exists",
        CANNOT_MODIFY_SELF: "You cannot change your own account role",
        INVITE_INVALID: "Invalid or expired admin invitation",
        INVITE_ALREADY_ADMIN: "This user is already an admin",
      },
    },
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../../config/redis.js", () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock("../../../utils/email.js", () => ({
  sendAdminInviteEmail: vi.fn(),
}));

vi.mock("../../../utils/audit-log.js", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password_placeholder") },
  hash: vi.fn().mockResolvedValue("hashed_password_placeholder"),
}));

describe("Admin Users Service", () => {
  const adminActorId = "admin_1";
  const targetUserId = "user_1";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(1);
    sendAdminInviteEmail.mockResolvedValue({ success: true });
  });

  describe("sendAdminInvite", () => {
    const payload = { email: "NEWADMIN@Example.com" };

    test("stores an invite token in Redis and emails the invitee", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await sendAdminInvite(payload, adminActorId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "newadmin@example.com" },
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^admin_invite:[0-9a-f]{64}$/),
        "newadmin@example.com",
        "EX",
        7 * 24 * 60 * 60
      );
      const key = mockRedis.set.mock.calls[0][0];
      expect(sendAdminInviteEmail).toHaveBeenCalledWith(
        "newadmin@example.com",
        key.replace("admin_invite:", "")
      );
      expect(result.success).toBe(true);
      expect(result.inviteToken).toMatch(/^[0-9a-f]{64}$/);
    });

    test("throws ConflictError when the email belongs to an existing non-admin user", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "existing",
        email: "newadmin@example.com",
        role: "ORGANIZER",
        deletedAt: null,
      });

      await expect(sendAdminInvite(payload, adminActorId)).rejects.toThrow(ConflictError);
      expect(sendAdminInviteEmail).not.toHaveBeenCalled();
    });

    test("throws ConflictError when the email belongs to an existing admin", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "existing",
        email: "newadmin@example.com",
        role: "ADMIN",
        deletedAt: null,
      });

      await expect(sendAdminInvite(payload, adminActorId)).rejects.toThrow(ConflictError);
      expect(sendAdminInviteEmail).not.toHaveBeenCalled();
    });

    test("deletes the invite token and fails softly when the email cannot be sent", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      sendAdminInviteEmail.mockResolvedValue({ success: false, error: "smtp down" });

      const result = await sendAdminInvite(payload, adminActorId);

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringMatching(/^admin_invite:[0-9a-f]{64}$/)
      );
      expect(result.success).toBe(false);
    });
  });

  describe("acceptAdminInvite", () => {
    const token = "a".repeat(64);
    const acceptPayload = { token, name: "New Admin", password: "AdminPass123" };

    test("creates an ADMIN account for a fresh email and consumes the token", async () => {
      mockRedis.get.mockResolvedValue("invitee@example.com");
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "new_admin",
        name: "New Admin",
        email: "invitee@example.com",
        role: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
      });

      const result = await acceptAdminInvite(acceptPayload);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: "New Admin",
          email: "invitee@example.com",
          passwordHash: "hashed_password_placeholder",
          role: "ADMIN",
          status: "ACTIVE",
          emailVerifiedAt: expect.any(Date),
        },
      });
      expect(mockRedis.del).toHaveBeenCalledWith(`admin_invite:${token}`);
      expect(result.role).toBe("ADMIN");
      expect(result.passwordHash).toBeUndefined();
    });

    test("reactivates a soft-deleted user with that email as an ADMIN", async () => {
      mockRedis.get.mockResolvedValue("invitee@example.com");
      prisma.user.findUnique.mockResolvedValue({
        id: "deleted_user",
        email: "invitee@example.com",
        role: "ATTENDEE",
        deletedAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({
        id: "deleted_user",
        name: "New Admin",
        email: "invitee@example.com",
        role: "ADMIN",
        status: "ACTIVE",
      });

      const result = await acceptAdminInvite(acceptPayload);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "deleted_user" },
        data: expect.objectContaining({
          name: "New Admin",
          email: "invitee@example.com",
          role: "ADMIN",
          deletedAt: null,
        }),
      });
      expect(result.role).toBe("ADMIN");
    });

    test("throws UnauthorizedError when the invite token is invalid or expired", async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(acceptAdminInvite(acceptPayload)).rejects.toThrow(UnauthorizedError);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    test("throws ConflictError when a non-admin account now owns the email", async () => {
      mockRedis.get.mockResolvedValue("invitee@example.com");
      prisma.user.findUnique.mockResolvedValue({
        id: "existing",
        email: "invitee@example.com",
        role: "ORGANIZER",
        deletedAt: null,
      });

      await expect(acceptAdminInvite(acceptPayload)).rejects.toThrow(ConflictError);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    test("throws ConflictError when the invitee is already an admin", async () => {
      mockRedis.get.mockResolvedValue("invitee@example.com");
      prisma.user.findUnique.mockResolvedValue({
        id: "existing",
        email: "invitee@example.com",
        role: "ADMIN",
        deletedAt: null,
      });

      await expect(acceptAdminInvite(acceptPayload)).rejects.toThrow(ConflictError);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe("promoteToAdmin", () => {
    test("promotes an existing user to ADMIN and audits it", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: targetUserId,
        name: "Attendee",
        email: "attendee@example.com",
        role: "ATTENDEE",
        status: "ACTIVE",
      });
      prisma.user.update.mockResolvedValue({
        id: targetUserId,
        name: "Attendee",
        email: "attendee@example.com",
        role: "ADMIN",
        status: "ACTIVE",
      });

      const result = await promoteToAdmin(targetUserId, adminActorId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: { role: "ADMIN" },
      });
      expect(result.role).toBe("ADMIN");
    });

    test("is idempotent when the user is already an ADMIN", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: targetUserId,
        role: "ADMIN",
      });
      prisma.user.update.mockResolvedValue({
        id: targetUserId,
        role: "ADMIN",
      });

      const result = await promoteToAdmin(targetUserId, adminActorId);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: { role: "ADMIN" },
      });
      expect(result.role).toBe("ADMIN");
    });

    test("throws ForbiddenError when an admin targets their own account", async () => {
      await expect(promoteToAdmin(adminActorId, adminActorId)).rejects.toThrow(ForbiddenError);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    test("throws NotFoundError when the user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(promoteToAdmin(targetUserId, adminActorId)).rejects.toThrow(NotFoundError);
    });

    test("throws NotFoundError when the user is deleted", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: targetUserId,
        role: "ATTENDEE",
        deletedAt: new Date(),
      });

      await expect(promoteToAdmin(targetUserId, adminActorId)).rejects.toThrow(NotFoundError);
    });
  });
});
