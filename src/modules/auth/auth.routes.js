import { Router } from 'express';
import { generateTokens, refreshToken, registerUser, authenticateUser, blacklistRefreshToken, hashPassword } from './auth.service.js';
import { success, created } from '../../utils/response.js';
import { systemMessages } from '../../config/index.js';
import { UnauthorizedError } from '../../utils/error.js';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema.js';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    }
    const { name, email, password, role } = parsed.data;

    const passwordHash = await hashPassword(password);
    const user = await registerUser({ name, email, passwordHash, role });

    const tokens = generateTokens(user);

    return created(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens }, systemMessages.SUCCESS.AUTH.REGISTER);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    }
    const { email, password } = parsed.data;

    const user = await authenticateUser(email, password);
    
    const tokens = generateTokens(user);

    return success(res, tokens, systemMessages.SUCCESS.AUTH.LOGIN);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: 'error', message: parsed.error.issues[0].message });
    }
    const { refreshToken: token } = parsed.data;

    const newTokens = refreshToken(token);
    return success(res, newTokens, systemMessages.SUCCESS.AUTH.TOKEN_REFRESHED);
  } catch (error) {
    if (!error.status) {
      return next(new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_INVALID));
    }
    return next(error);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (token) {
      await blacklistRefreshToken(token);
    }
    return success(res, null, systemMessages.SUCCESS.AUTH.LOGOUT);
  } catch (error) {
    return next(error);
  }
});

export default router;