import { vi, describe, it, expect, beforeEach } from 'vitest';
import { requireRole, requireAuth } from '../rbac.middleware.js';
import { systemMessages } from '../../config/index.js';

describe('RBAC Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  describe('requireAuth', () => {
    it('should return 401 if req.user is missing', () => {
      requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    });

    it('should call next if req.user is present', () => {
      req.user = { id: 1 };
      requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    const middleware = requireRole('Admin', 'Organizer');

    it('should return 401 if req.user is missing', () => {
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    });

    it('should return 403 if user role is not allowed', () => {
      req.user = { role: 'Attendee' };
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: systemMessages.ERROR.AUTH.FORBIDDEN });
    });

    it('should call next if user role is allowed (Admin)', () => {
      req.user = { role: 'Admin' };
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should call next if user role is allowed (Organizer)', () => {
      req.user = { role: 'Organizer' };
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
