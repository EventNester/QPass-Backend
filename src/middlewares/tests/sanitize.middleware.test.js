import { describe, it, expect } from 'vitest';
import { sanitizeBody } from '../sanitize.middleware.js';

function run(body) {
  const req = { body };
  sanitizeBody(req, {}, () => {});
  return req.body;
}

describe('sanitizeBody', () => {
  it('strips __proto__ keys from the request body', () => {
    const body = run(JSON.parse('{"name":"Ada","__proto__":{"polluted":true}}'));

    expect(body.name).toBe('Ada');
    expect(Object.hasOwn(body, '__proto__')).toBe(false);
  });

  it('strips constructor and prototype keys recursively', () => {
    const body = run({ meta: { constructor: 1, prototype: 2, ok: true } });

    expect(body.meta.ok).toBe(true);
    expect(Object.hasOwn(body.meta, 'constructor')).toBe(false);
    expect(Object.hasOwn(body.meta, 'prototype')).toBe(false);
  });

  it('does not trim string values (passwords must stay intact)', () => {
    const body = run({ password: '  Secret123  ' });

    expect(body.password).toBe('  Secret123  ');
  });

  it('sanitizes objects inside a top-level array', () => {
    const body = run(JSON.parse('[{"ok":true,"__proto__":{"polluted":true}}]'));

    expect(body[0].ok).toBe(true);
    expect(Object.hasOwn(body[0], '__proto__')).toBe(false);
  });

  it('passes arrays through unchanged', () => {
    const body = run({ tags: ['a', 'b'] });

    expect(body.tags).toEqual(['a', 'b']);
  });

  it('leaves non-object bodies untouched', () => {
    const req = { body: undefined };
    sanitizeBody(req, {}, () => {});
    expect(req.body).toBeUndefined();
  });
});
