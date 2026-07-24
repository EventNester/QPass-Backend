import { vi, describe, it, expect, beforeEach } from 'vitest';
import { authenticateUser } from '../auth.middleware.js';
import * as authService from '../auth.service.js';
import { systemMessages } from '../../../config/index.js';

vi.mock('../auth.service.js', () => ({
  validateToken: vi.fn(),
  isTokenBlacklisted: vi.fn(),
}));

describe('Auth Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  it('should return 401 if no authorization header', async () => {
    await authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
  });

  it('should return 401 if token does not start with Bearer', async () => {
    req.headers.authorization = 'Basic token123';
    await authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 401 if token is blacklisted', async () => {
    req.headers.authorization = 'Bearer blacklisted_token';
    authService.isTokenBlacklisted.mockResolvedValue(true);
    
    await authenticateUser(req, res, next);
    
    expect(authService.isTokenBlacklisted).toHaveBeenCalledWith('blacklisted_token');
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 401 if token is invalid', async () => {
    req.headers.authorization = 'Bearer invalid_token';
    authService.isTokenBlacklisted.mockResolvedValue(false);
    authService.validateToken.mockImplementation(() => { throw new Error('Invalid token'); });
    
    await authenticateUser(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should attach user and call next if token is valid', async () => {
    req.headers.authorization = 'Bearer valid_token';
    const mockUser = { id: 1, role: 'ORGANIZER' };
    authService.isTokenBlacklisted.mockResolvedValue(false);
    authService.validateToken.mockReturnValue(mockUser);
    
    await authenticateUser(req, res, next);
    
    expect(req.user).toEqual(mockUser);
    expect(next).toHaveBeenCalled();
  });
});
