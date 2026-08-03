/**
 * Parse a CORS origin setting that may be `*` or a comma-separated list,
 * returning a value accepted by both the Express `cors` package and
 * Socket.IO's `cors.origin` option.
 *
 * @param {string|undefined} value - Raw CORS_ORIGIN value
 * @returns {string|string[]} `'*'` or an array of origin strings
 */
export function parseCorsOrigins(value) {
  if (!value || value.trim() === '*') {
    return '*';
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : '*';
}
