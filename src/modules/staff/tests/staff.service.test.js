import { describe, test, expect, vi, beforeEach } from "vitest";
import { assignStaff, listStaff, removeStaff } from "../staff.service.js";
import prisma from "../../../database/index.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../../../utils/error.js";

const mockPrisma = vi.hoisted(() => {
  const base = {
    event: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    eventStaffAssignment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return {
    ...base,
    $transaction: vi.fn((fn) => fn(base)),
  };
});

vi.mock("../../../database/index.js", () => ({
  default: mockPrisma,
}));

vi.mock("../../../config/index.js", () => ({
  systemMessages: {
    ERROR: {
      EVENT: {
        NOT_FOUND: "Event not found",
        UNAUTHORIZED: "You are not the owner of this event",
      },
      STAFF: {
        ALREADY_ASSIGNED: "Staff member is already assigned to this event",
        NOT_FOUND: "Staff assignment not found",
      },
    },
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password_placeholder") },
  hash: vi.fn().mockResolvedValue("hashed_password_placeholder"),
}));

const mockSendNotification = vi.fn().mockResolvedValue({ success: true });
vi.mock("../../../modules/notifications/notification.service.js", () => ({
  sendNotification: (...args) => mockSendNotification(...args),
}));

describe("Staff Service", () => {
  const ownerId = "organizer_1";
  const eventId = "event_1";
  const staffUserId = "staff_1";
  const staffAssignmentId = "assignment_1";

  const mockEvent = {
    id: eventId,
    title: "Test Event",
    ownerId,
    status: "PUBLISHED",
    deletedAt: null,
  };

  const mockExistingUser = {
    id: staffUserId,
    name: "existinguser",
    email: "existing@example.com",
    role: "ATTENDEE",
    status: "ACTIVE",
  };

  const mockStaffUser = {
    ...mockExistingUser,
    role: "STAFF",
  };

  const mockAssignment = {
    id: staffAssignmentId,
    eventId,
    userId: staffUserId,
    permissionScope: null,
    active: true,
    assignedAt: new Date(),
    user: mockStaffUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assignStaff", () => {
    test("should assign existing non-staff user and upgrade role to STAFF", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.user.findUnique.mockResolvedValue(mockExistingUser);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue(mockStaffUser);
      prisma.eventStaffAssignment.create.mockResolvedValue(mockAssignment);
      prisma.auditLog.create.mockResolvedValue({});

      const result = await assignStaff(eventId, ownerId, {
        email: "existing@example.com",
      });

      expect(result).toEqual(mockAssignment);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: staffUserId },
        data: { role: "STAFF" },
      });
      expect(prisma.eventStaffAssignment.create).toHaveBeenCalledWith({
        data: { eventId, userId: staffUserId, permissionScope: null },
        include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
      });
      expect(mockSendNotification).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: ownerId,
          action: "STAFF_ASSIGN",
          entity: "EventStaffAssignment",
          entityId: staffAssignmentId,
          afterSnapshot: { email: "existing@example.com", eventId, permissionScope: null },
        },
      });
    });

    test("should assign existing STAFF user without upgrading role", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.user.findUnique.mockResolvedValue(mockStaffUser);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(null);
      prisma.eventStaffAssignment.create.mockResolvedValue(mockAssignment);

      await assignStaff(eventId, ownerId, { email: "existing@example.com" });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test("should create new user when email does not exist and assign as STAFF", async () => {
      const newUserId = "new_staff_1";
      const newUser = {
        id: newUserId,
        name: "newuser",
        email: "newuser@example.com",
        role: "STAFF",
        status: "ACTIVE",
      };
      const newAssignment = {
        id: "assignment_new",
        eventId,
        userId: newUserId,
        permissionScope: "SCANNER",
        active: true,
        assignedAt: new Date(),
        user: newUser,
      };

      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(null);
      prisma.eventStaffAssignment.create.mockResolvedValue(newAssignment);

      const result = await assignStaff(eventId, ownerId, {
        email: "newuser@example.com",
        permissionScope: "SCANNER",
      });

      expect(result).toEqual(newAssignment);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: "newuser",
          email: "newuser@example.com",
          passwordHash: "hashed_password_placeholder",
          role: "STAFF",
        },
      });
      expect(prisma.eventStaffAssignment.create).toHaveBeenCalledWith({
        data: { eventId, userId: newUserId, permissionScope: "SCANNER" },
        include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
      });
      expect(mockSendNotification).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: "STAFF_INVITE_CREATE" }),
      });
    });

    test("should throw ConflictError if user is already assigned", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.user.findUnique.mockResolvedValue(mockStaffUser);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(mockAssignment);

      await expect(
        assignStaff(eventId, ownerId, { email: "existing@example.com" })
      ).rejects.toThrow(ConflictError);
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        assignStaff("nonexistent", ownerId, { email: "test@example.com" })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError if caller is not the event owner", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      await expect(
        assignStaff(eventId, "attacker", { email: "test@example.com" })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should send invite email fire-and-forget for newly created user", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockStaffUser);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(null);
      prisma.eventStaffAssignment.create.mockResolvedValue(mockAssignment);

      await assignStaff(eventId, ownerId, { email: "existing@example.com" });

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "existing@example.com",
          template: "staff-invite",
          eventId,
        })
      );
    });
  });

  describe("listStaff", () => {
    const mockAssignments = [
      {
        id: "a1",
        eventId,
        userId: "u1",
        permissionScope: "SCANNER",
        active: true,
        assignedAt: new Date(),
        user: { id: "u1", name: "Staff One", email: "one@example.com", role: "STAFF", status: "ACTIVE" },
      },
      {
        id: "a2",
        eventId,
        userId: "u2",
        permissionScope: null,
        active: true,
        assignedAt: new Date(),
        user: { id: "u2", name: "Staff Two", email: "two@example.com", role: "STAFF", status: "ACTIVE" },
      },
    ];

    test("should return all active staff assignments for the event", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventStaffAssignment.findMany.mockResolvedValue(mockAssignments);

      const result = await listStaff(eventId, ownerId);

      expect(result).toEqual(mockAssignments);
      expect(result).toHaveLength(2);
      expect(prisma.eventStaffAssignment.findMany).toHaveBeenCalledWith({
        where: { eventId, active: true },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, status: true } },
        },
        orderBy: { assignedAt: "desc" },
      });
    });

    test("should return empty array when no staff assigned", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventStaffAssignment.findMany.mockResolvedValue([]);

      const result = await listStaff(eventId, ownerId);

      expect(result).toEqual([]);
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(listStaff("nonexistent", ownerId)).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError if caller is not the event owner", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      await expect(listStaff(eventId, "attacker")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("removeStaff", () => {
    test("should remove staff assignment and log audit", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(mockAssignment);
      prisma.eventStaffAssignment.delete.mockResolvedValue(mockAssignment);
      prisma.auditLog.create.mockResolvedValue({});

      const result = await removeStaff(eventId, staffAssignmentId, ownerId);

      expect(result).toEqual({ id: staffAssignmentId, eventId });
      expect(prisma.eventStaffAssignment.delete).toHaveBeenCalledWith({
        where: { id: staffAssignmentId },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: ownerId,
          action: "STAFF_REMOVE",
          entity: "EventStaffAssignment",
          entityId: staffAssignmentId,
          beforeSnapshot: {
            eventId,
            userId: mockAssignment.userId,
            permissionScope: mockAssignment.permissionScope,
          },
        },
      });
    });

    test("should throw NotFoundError if assignment does not exist", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue(null);

      await expect(
        removeStaff(eventId, "nonexistent", ownerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError if assignment belongs to a different event", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventStaffAssignment.findUnique.mockResolvedValue({
        ...mockAssignment,
        eventId: "other_event",
      });

      await expect(
        removeStaff(eventId, staffAssignmentId, ownerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        removeStaff("nonexistent", staffAssignmentId, ownerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError if caller is not the event owner", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      await expect(
        removeStaff(eventId, staffAssignmentId, "attacker")
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
