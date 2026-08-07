process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/qpass_test?schema=public";
process.env.JWT_SECRET ||= "test_secret_key_min_32_bytes_long_here";
process.env.JWT_REFRESH_SECRET ||= "test_refresh_secret_key_min_32_bytes";

import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import checkinsRouter from "../checkins.routes.js";
import { signAccessToken } from "../../../utils/jwt.utils.js";

const mService = vi.hoisted(() => ({
  getCheckinStatistics: vi.fn(),
  scanQr: vi.fn(),
  getCheckins: vi.fn(),
  undoCheckin: vi.fn(),
}));

vi.mock("../checkins.service.js", () => mService);

vi.mock("../../auth/auth.middleware.js", async () => {
  const { verifyAccessToken } = await import("../../../utils/jwt.utils.js");
  return {
    requireAuth: async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ status: "error", message: "Unauthorized" });
      }
      try {
        const token = authHeader.split(" ")[1];
        const decoded = verifyAccessToken(token);
        req.user = { ...decoded, id: decoded.sub };
        next();
      } catch {
        return res.status(401).json({ status: "error", message: "Unauthorized" });
      }
    },
  };
});

const EVENT_ID = "11111111-1111-1111-1111-111111111111";

const scopedStats = {
  checkins: { total: 4, valid: 3, duplicate: 2 },
  uniqueAttendeesCheckedIn: 1,
  eventsWithCheckins: 1,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/checkins", checkinsRouter);
  return app;
}

function accessTokenFor({ sub, role }) {
  return signAccessToken({
    sub,
    name: "Test User",
    email: "test@example.com",
    role,
  });
}

describe("GET /api/v1/checkins/stats (route-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mService.getCheckinStatistics.mockResolvedValue(scopedStats);
  });

  test("returns scoped statistics for the event owner authenticated with a JWT sub claim", async () => {
    const app = buildApp();
    const token = accessTokenFor({ sub: "organizer_1", role: "ORGANIZER" });

    const res = await request(app)
      .get(`/api/v1/checkins/stats?eventId=${EVENT_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toEqual(scopedStats);
    expect(mService.getCheckinStatistics).toHaveBeenCalledWith(
      "organizer_1",
      "ORGANIZER",
      { eventId: EVENT_ID }
    );
  });

  test("returns scoped statistics for an active staff member authenticated with a JWT sub claim", async () => {
    const app = buildApp();
    const token = accessTokenFor({ sub: "staff_1", role: "STAFF" });

    const res = await request(app)
      .get(`/api/v1/checkins/stats?eventId=${EVENT_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(scopedStats);
    expect(mService.getCheckinStatistics).toHaveBeenCalledWith(
      "staff_1",
      "STAFF",
      { eventId: EVENT_ID }
    );
  });

  test("returns 401 when no bearer token is present", async () => {
    const app = buildApp();

    const res = await request(app).get(`/api/v1/checkins/stats?eventId=${EVENT_ID}`);

    expect(res.status).toBe(401);
    expect(mService.getCheckinStatistics).not.toHaveBeenCalled();
  });

  test("returns 422 for an invalid eventId query parameter", async () => {
    const app = buildApp();
    const token = accessTokenFor({ sub: "organizer_1", role: "ORGANIZER" });

    const res = await request(app)
      .get("/api/v1/checkins/stats?eventId=not-a-uuid")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(mService.getCheckinStatistics).not.toHaveBeenCalled();
  });
});
