import { vi, describe, it, expect, beforeEach } from "vitest";

const m = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockTo = vi.fn(() => ({ emit: vi.fn() }));
  const mockUse = vi.fn();
  const mockClose = vi.fn();
  const mockAdapter = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue();
  const mockQuit = vi.fn().mockResolvedValue();
  const mockDuplicate = vi.fn();
  const mockValidateToken = vi.fn();
  const mockGetSocketConfig = vi.fn();
  const mockLogger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() };

  function MockServer(...args) {
    MockServer.calls.push(args);
    this.on = mockOn;
    this.to = mockTo;
    this.use = mockUse;
    this.close = mockClose;
    this.adapter = mockAdapter;
  }
  MockServer.calls = [];

  return {
    mockOn, mockTo, mockUse, mockClose, mockAdapter,
    mockConnect, mockQuit, mockDuplicate,
    mockValidateToken, mockGetSocketConfig, mockLogger,
    MockServer,
  };
});

vi.mock("socket.io", () => ({ Server: m.MockServer }));
vi.mock("@socket.io/redis-adapter", () => ({ createAdapter: vi.fn() }));
vi.mock("redis", () => ({
  createClient: vi.fn(() => ({
    connect: m.mockConnect,
    quit: m.mockQuit,
    duplicate: m.mockDuplicate,
  })),
}));
vi.mock("../../modules/auth/auth.service.js", () => ({
  validateToken: m.mockValidateToken,
}));
vi.mock("../../config/socket.config.js", () => ({
  getSocketConfig: m.mockGetSocketConfig,
}));
vi.mock("../../config/index.js", () => ({
  logger: m.mockLogger,
}));

import {
  initSocket,
  getIO,
  emitCheckinUpdate,
  emitRegistrationNew,
  emitScanResult,
  closeSocket,
} from "../socket.handler.js";

describe("Socket Handler", () => {
  const mockServer = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    m.MockServer.calls = [];
    await closeSocket();
    m.mockGetSocketConfig.mockReturnValue({
      corsOrigin: "*",
      redis: { host: "localhost", port: 6379, password: "", database: 0 },
    });
    m.mockDuplicate.mockReturnValue({
      connect: m.mockConnect,
      quit: m.mockQuit,
    });
  });

  describe("initSocket", () => {
    it("should create a Socket.IO server with CORS config", async () => {
      await initSocket(mockServer);
      expect(m.MockServer.calls.length).toBe(1);
      expect(m.MockServer.calls[0][0]).toBe(mockServer);
      expect(m.MockServer.calls[0][1]).toEqual({
        cors: { origin: "*", methods: ["GET", "POST"] },
        transports: ["websocket", "polling"],
      });
    });

    it("should register JWT auth middleware", async () => {
      await initSocket(mockServer);
      expect(m.mockUse).toHaveBeenCalled();
    });

    it("should register connection handler", async () => {
      await initSocket(mockServer);
      expect(m.mockOn).toHaveBeenCalledWith("connection", expect.any(Function));
    });

    it("should attempt Redis adapter setup", async () => {
      await initSocket(mockServer);
      expect(m.mockConnect).toHaveBeenCalled();
    });

    it("should fall back gracefully when Redis is unavailable", async () => {
      m.mockConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await initSocket(mockServer);
      expect(m.mockOn).toHaveBeenCalled();
      expect(m.mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("JWT middleware", () => {
    async function getMiddleware() {
      await initSocket(mockServer);
      return m.mockUse.mock.calls[0][0];
    }

    it("should reject connection with no token", async () => {
      const middleware = await getMiddleware();
      const mockNext = vi.fn();
      middleware({ handshake: { auth: {} } }, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new Error("Authentication error"));
    });

    it("should reject connection with invalid token", async () => {
      m.mockValidateToken.mockImplementation(() => { throw new Error("Invalid"); });
      const middleware = await getMiddleware();
      const mockNext = vi.fn();
      middleware({ handshake: { auth: { token: "bad" } } }, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new Error("Authentication error"));
    });

    it("should accept connection with valid token", async () => {
      const mockUser = { sub: "user-1", role: "ORGANIZER" };
      m.mockValidateToken.mockReturnValue(mockUser);
      const middleware = await getMiddleware();
      const mockNext = vi.fn();
      const mockSocket = { handshake: { auth: { token: "valid" } } };
      middleware(mockSocket, mockNext);
      expect(mockSocket.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("room management", () => {
    async function getConnectionHandler() {
      await initSocket(mockServer);
      return m.mockOn.mock.calls.find((c) => c[0] === "connection")[1];
    }

    it("should join dashboard room on join:event", async () => {
      const handler = await getConnectionHandler();
      const mockSocket = { on: vi.fn(), join: vi.fn() };
      handler(mockSocket);
      mockSocket.on.mock.calls.find((c) => c[0] === "join:event")[1]("evt-123");
      expect(mockSocket.join).toHaveBeenCalledWith("event:evt-123:dashboard");
    });

    it("should leave dashboard room on leave:event", async () => {
      const handler = await getConnectionHandler();
      const mockSocket = { on: vi.fn(), leave: vi.fn() };
      handler(mockSocket);
      mockSocket.on.mock.calls.find((c) => c[0] === "leave:event")[1]("evt-123");
      expect(mockSocket.leave).toHaveBeenCalledWith("event:evt-123:dashboard");
    });

    it("should join scan room on join:scan", async () => {
      const handler = await getConnectionHandler();
      const mockSocket = { on: vi.fn(), join: vi.fn() };
      handler(mockSocket);
      mockSocket.on.mock.calls.find((c) => c[0] === "join:scan")[1]("evt-123");
      expect(mockSocket.join).toHaveBeenCalledWith("event:evt-123:scan");
    });

    it("should leave scan room on leave:scan", async () => {
      const handler = await getConnectionHandler();
      const mockSocket = { on: vi.fn(), leave: vi.fn() };
      handler(mockSocket);
      mockSocket.on.mock.calls.find((c) => c[0] === "leave:scan")[1]("evt-123");
      expect(mockSocket.leave).toHaveBeenCalledWith("event:evt-123:scan");
    });
  });

  describe("getIO", () => {
    it("should return falsy before initSocket", () => {
      expect(getIO()).toBeFalsy();
    });

    it("should return io instance after initSocket", async () => {
      await initSocket(mockServer);
      expect(getIO()).toBeDefined();
    });
  });

  describe("emitters", () => {
    it("emitCheckinUpdate should emit to dashboard room", async () => {
      const mockEmit = vi.fn();
      m.mockTo.mockReturnValue({ emit: mockEmit });
      await initSocket(mockServer);

      emitCheckinUpdate("evt-1", { result: "VALID", attendeeName: "Ada", totalCheckedIn: 5 });

      expect(m.mockTo).toHaveBeenCalledWith("event:evt-1:dashboard");
      expect(mockEmit).toHaveBeenCalledWith(
        "checkin:update",
        expect.objectContaining({ result: "VALID", attendeeName: "Ada", totalCheckedIn: 5, timestamp: expect.any(String) })
      );
    });

    it("emitRegistrationNew should emit to dashboard room", async () => {
      const mockEmit = vi.fn();
      m.mockTo.mockReturnValue({ emit: mockEmit });
      await initSocket(mockServer);

      emitRegistrationNew("evt-1", { registrationId: "reg-1", attendeeName: "Chidi" });

      expect(m.mockTo).toHaveBeenCalledWith("event:evt-1:dashboard");
      expect(mockEmit).toHaveBeenCalledWith(
        "registration:new",
        expect.objectContaining({ registrationId: "reg-1", attendeeName: "Chidi", timestamp: expect.any(String) })
      );
    });

    it("emitScanResult should emit to scan room", async () => {
      const mockEmit = vi.fn();
      m.mockTo.mockReturnValue({ emit: mockEmit });
      await initSocket(mockServer);

      emitScanResult("evt-1", { result: "DUPLICATE", message: "Already scanned" });

      expect(m.mockTo).toHaveBeenCalledWith("event:evt-1:scan");
      expect(mockEmit).toHaveBeenCalledWith("scan:result", { result: "DUPLICATE", message: "Already scanned" });
    });

    it("emitters should be no-ops before initSocket", () => {
      expect(() => emitCheckinUpdate("evt-1", {})).not.toThrow();
      expect(() => emitRegistrationNew("evt-1", {})).not.toThrow();
      expect(() => emitScanResult("evt-1", {})).not.toThrow();
    });
  });

  describe("closeSocket", () => {
    it("should close Redis clients and Socket.IO server", async () => {
      await initSocket(mockServer);
      await closeSocket();
      expect(m.mockQuit).toHaveBeenCalled();
      expect(m.mockClose).toHaveBeenCalled();
    });

    it("should be safe to call multiple times", async () => {
      await initSocket(mockServer);
      await closeSocket();
      await closeSocket();
      expect(m.mockClose).toHaveBeenCalledTimes(1);
    });

    it("should be safe to call without init", async () => {
      await expect(closeSocket()).resolves.not.toThrow();
    });
  });
});
