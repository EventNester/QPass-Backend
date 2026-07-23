import { Router } from 'express';
import { generateTokens, refreshToken } from './auth.service.js';

const router = Router();

// Password Validation Helper: Min 8 chars, uppercase, lowercase, number
const isPasswordValid = (password) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return regex.test(password);
};

// Valid Roles Enum
const VALID_ROLES = ['ORGANIZER', 'STAFF', 'ATTENDEE', 'PLATFORM_ADMIN'];

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Check required fields
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firstName, lastName, email, password, and role are required.',
      });
    }

    // Validate role enum
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    // Validate password complexity
    if (!isPasswordValid(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.',
      });
    }

    // Mock created user
    const user = {
      id: 'usr_123',
      firstName,
      lastName,
      email,
      role,
    };

    const tokens = generateTokens(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user, ...tokens },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const user = {
      id: 'usr_123',
      firstName: 'Lucas',
      lastName: 'Nash',
      email,
      role: 'ATTENDEE',
    };
    
    const tokens = generateTokens(user);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    const newTokens = refreshToken(token);
    res.status(200).json({ success: true, data: newTokens });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export default router;