import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefreshkey';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * Generate Access and Refresh JWT Tokens
 */
export const generateTokens = (user) => {
  const payload = {
    sub: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

  return { accessToken, refreshToken };
};

/**
 * Validate Access Token
 */
export const validateToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Refresh Access Token using Refresh Token
 */
export const refreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    const newAccessToken = jwt.sign(
      {
        sub: decoded.sub,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        email: decoded.email,
        role: decoded.role,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
    return { accessToken: newAccessToken };
  } catch {
    throw new Error('Invalid or expired refresh token');
  }
};