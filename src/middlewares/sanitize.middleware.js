const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj) {
  const out = {};
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    out[key] = sanitizeValue(obj[key]);
  }
  return out;
}

/**
 * Strip prototype-pollution keys (e.g. `__proto__`) from the request body.
 * String values are intentionally left untrimmed so password fields are
 * never altered.
 */
export function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}
