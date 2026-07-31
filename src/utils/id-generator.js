import crypto from "crypto";

/**
 * Generates a random ticket code.
 * Example:
 * QPASS-8F4K2M9X
 */
export function generateTicketCode(length = 8) {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  while (code.length < length) {
    const random = crypto.randomBytes(length);

    for (const byte of random) {
      if (code.length >= length) break;

      code += characters[byte % characters.length];
    }
  }

  return `QPASS-${code}`;
}

/**
 * Generates a confirmation code.
 * Example:
 * CONF-7KD9X2
 */
export function generateConfirmationCode(length = 6) {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  while (code.length < length) {
    const random = crypto.randomBytes(length);

    for (const byte of random) {
      if (code.length >= length) break;

      code += characters[byte % characters.length];
    }
  }

  return `CONF-${code}`;
}

/**
 * Generates a random slug suffix.
 * Example:
 * a8xk92
 */
export function generateSlugSuffix(length = 6) {
  return crypto
    .randomBytes(length)
    .toString("hex")
    .slice(0, length)
    .toLowerCase();
}

/**
 * Generates a secure QR token.
 * 64 hexadecimal characters.
 */
export function generateQrToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generates a SHA-256 hash.
 */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}