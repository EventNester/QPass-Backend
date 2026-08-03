import { describe, it, expect } from 'vitest';
import { parseCorsOrigins } from '../cors.js';

describe('parseCorsOrigins', () => {
  it('returns * for empty or undefined values', () => {
    expect(parseCorsOrigins()).toBe('*');
    expect(parseCorsOrigins('')).toBe('*');
    expect(parseCorsOrigins('   ')).toBe('*');
    expect(parseCorsOrigins(' * ')).toBe('*');
  });

  it('returns a single-element array for one origin', () => {
    expect(parseCorsOrigins('http://localhost:3000')).toEqual(['http://localhost:3000']);
  });

  it('splits comma-separated origins and trims whitespace', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com,http://c.com')).toEqual([
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ]);
  });

  it('ignores empty entries between commas', () => {
    expect(parseCorsOrigins('http://a.com, , http://b.com')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });
});
