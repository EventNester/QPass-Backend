import { Router } from 'express';
import { generateTokens, refreshToken, registerUser, authenticateUser, blacklistRefreshToken, hashPassword } from './auth.service.js';
import { success, created } from '../../utils/response.js';
import { systemMessages } from '../../config/index.js';

import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.schema.js';
import { requireAuth } from './auth.middleware.js';
import { authLimiter } from '../../middlewares/rate-limit.middleware.js';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    }
    const { name, email, password } = parsed.data;

    const passwordHash = await hashPassword(password);
    const user = await registerUser({ name, email, passwordHash, role: 'ATTENDEE' });

    const tokens = generateTokens(user);

    return created(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens }, systemMessages.SUCCESS.AUTH.REGISTER);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    }
    const { email, password } = parsed.data;

    const user = await authenticateUser(email, password);
    
    const tokens = generateTokens(user);

    return success(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens }, systemMessages.SUCCESS.AUTH.LOGIN);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', requireAuth, async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
    }
    const { refreshToken: token } = parsed.data;

    const newTokens = await refreshToken(token);
    return success(res, newTokens, systemMessages.SUCCESS.AUTH.TOKEN_REFRESHED);
  } catch (error) {
    return next(error);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
    }
    await blacklistRefreshToken(parsed.data.refreshToken);
    return success(res, null, systemMessages.SUCCESS.AUTH.LOGOUT);
  } catch (error) {
    return next(error);
  }
});

export default router;
