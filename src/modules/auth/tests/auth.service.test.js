import { describe, test, expect } from 'vitest';
import { generateTokens, validateToken, refreshToken } from '../auth.service.js';

describe('Auth Service Tests', () => {
  const mockUser = {
    id: 'user_1',
    firstName: 'Lucas',
    lastName: 'Nash',
    email: 'lucas@example.com',
    role: 'ORGANIZER',
  };

  test('should generate valid access and refresh tokens with user payload', () => {
    const tokens = generateTokens(mockUser);
    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
  });

  test('should validate access token and contain user attributes', () => {
    const { accessToken } = generateTokens(mockUser);
    const decoded = validateToken(accessToken);
    expect(decoded.sub).toBe(mockUser.id);
    expect(decoded.firstName).toBe(mockUser.firstName);
    expect(decoded.lastName).toBe(mockUser.lastName);
    expect(decoded.role).toBe('ORGANIZER');
  });

  test('should refresh access token correctly', () => {
    const { refreshToken: token } = generateTokens(mockUser);
    const result = refreshToken(token);
    expect(result).toHaveProperty('accessToken');
  });
});