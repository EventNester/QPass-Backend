import { randomBytes } from "crypto";
import prisma from "../../database/index.js";
import { hashToken } from "../../utils/crypto.js";
import { NotFoundError } from "../../utils/error.js";
import { systemMessages } from "../../config/index.js";

const msg = systemMessages.ERROR;

/**
 * QR Token
 *
 * Tokens are opaque 64-char hex strings generated via `crypto.randomBytes(32)`.
 * Only the SHA-256 hash is stored in the database. Expiration is enforced
 * against the `QrToken.expiresAt` column (set to `event.endTime + 24h` at
 * issuance time). The raw token is delivered to the attendee and never persisted.
 *
 * @typedef {Object} QrTokenRecord
 * @property {string} id
 * @property {string} registrationId
 * @property {string} tokenHash - SHA-256 hex digest of the raw token
 * @property {Date} issuedAt
 * @property {Date} expiresAt - event.endTime + 24h
 * @property {Date|null} revokedAt
 * @property {number} scanCount
 */

class QrService {
  /**
   * Generate an opaque QR token for a registration.
   *
   * 1. Produce a random 64-char hex token.
   * 2. SHA-256 hash it and store the hash in QrToken.
   * 3. Return the raw token (delivered to attendee, never stored).
   *
   * @param {string} registrationId - The registration this token belongs to
   * @param {Date} expiresAt - Absolute expiration datetime (typically event.endTime + 24h)
   * @returns {Promise<string>} The raw hex token to deliver to the attendee
   * @throws {Error} If a token already exists for this registration
   */
  async generateToken(registrationId, expiresAt) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const existing = await prisma.qrToken.findUnique({
      where: { registrationId },
    });
    if (existing) {
      throw new Error(msg.TICKET.ALREADY_EXISTS);
    }

    await prisma.qrToken.create({
      data: {
        registrationId,
        tokenHash,
        expiresAt,
      },
    });

    return rawToken;
  }

  /**
   * Validate a scanned QR token string.
   *
   * 1. Hash the raw token with SHA-256.
   * 2. Look up the QrToken record by hash.
   * 3. Check expiration (expiresAt must be in the future).
   * 4. Check revocation (revokedAt must be null).
   * 5. Return the registration data if valid.
   *
   * @param {string} token - The raw token string scanned from the QR code
   * @returns {Promise<Object>} The QrToken record with its registration
   * @throws {NotFoundError} If the token hash is not found
   * @throws {Error} If the token has expired
   * @throws {Error} If the token has been revoked
   */
  async validateToken(token) {
    const tokenHash = hashToken(token);

    const qrToken = await prisma.qrToken.findUnique({
      where: { tokenHash },
      include: { registration: true },
    });

    if (!qrToken) {
      throw new NotFoundError(msg.TICKET.INVALID);
    }

    if (new Date(qrToken.expiresAt) < new Date()) {
      throw new Error(msg.TICKET.EXPIRED);
    }

    if (qrToken.revokedAt) {
      throw new Error(msg.TICKET.REVOKED);
    }

    return qrToken;
  }
}

export const qrService = new QrService();
