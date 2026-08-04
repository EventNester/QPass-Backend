import { describe, test, expect, vi, beforeEach } from "vitest";
import { bootstrapFirstAdmin } from "../../../scripts/create-admin.js";
import prisma from "../../../database/index.js";

const mockPrisma = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
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

describe("bootstrapFirstAdmin", () => {
  const input = { name: "Ops Admin", email: "OPS@Example.com", password: "AdminPass123" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates the first admin account when none exists", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "admin_1",
      name: "Ops Admin",
      email: "ops@example.com",
      role: "ADMIN",
      status: "ACTIVE",
    });

    const result = await bootstrapFirstAdmin(input);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { role: "ADMIN", deletedAt: null },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: "Ops Admin",
        email: "ops@example.com",
        passwordHash: "hashed_password_placeholder",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: expect.any(Date),
      },
    });
    expect(result.role).toBe("ADMIN");
  });

  test("refuses to run when an admin already exists", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "existing_admin", role: "ADMIN" });

    await expect(bootstrapFirstAdmin(input)).rejects.toThrow(/already exists/);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("promotes an existing non-admin user to be the first admin", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: "organizer_1",
      email: "ops@example.com",
      role: "ORGANIZER",
      deletedAt: null,
    });
    prisma.user.update.mockResolvedValue({
      id: "organizer_1",
      role: "ADMIN",
    });

    const result = await bootstrapFirstAdmin(input);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "organizer_1" },
      data: expect.objectContaining({ role: "ADMIN", email: "ops@example.com" }),
    });
    expect(result.role).toBe("ADMIN");
  });

  test("reactivates a soft-deleted user as the first admin", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: "deleted_user",
      email: "ops@example.com",
      role: "ATTENDEE",
      deletedAt: new Date(),
    });
    prisma.user.update.mockResolvedValue({
      id: "deleted_user",
      role: "ADMIN",
    });

    const result = await bootstrapFirstAdmin(input);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "deleted_user" },
      data: expect.objectContaining({ role: "ADMIN", deletedAt: null }),
    });
    expect(result.role).toBe("ADMIN");
  });

  test("rejects weak passwords before touching the database", async () => {
    await expect(
      bootstrapFirstAdmin({ name: "Ops Admin", email: "ops@example.com", password: "short" })
    ).rejects.toThrow(/at least 8 characters/);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  test("rejects invalid emails before touching the database", async () => {
    await expect(
      bootstrapFirstAdmin({ name: "Ops Admin", email: "not-an-email", password: "AdminPass123" })
    ).rejects.toThrow(/Invalid email/);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
