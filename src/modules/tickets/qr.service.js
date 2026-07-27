/**
 * QR Token Payload Structure
 *
 * Note: Since Phase 2 uses JWT for QR tokens, the 'signature' is typically
 * handled by the JWT header and verification process itself. However, if a
 * custom crypto approach is used, it can be attached directly to the payload.
 *
 * @typedef {Object} QrTokenPayload
 * @property {string} attendeeId
 * @property {string} eventId
 * @property {number} timestamp - Unix timestamp (issued at)
 * @property {string} [signature] - Handled by JWT natively, or populated for custom crypto
 */

/**
 * QR Service Skeleton
 * Handles generation and validation of attendee QR codes
 */
class QrService {
  /**
   * Generates a signed QR token for an attendee
   *
   * @param {string} attendeeId - The unique ID of the attendee
   * @param {string} eventId - The ID of the event the ticket is for
   * @returns {Promise<string>} A signed token string (e.g., JWT) representing the payload
   */
  async generateToken(_attendeeId, _eventId) {
    // TODO: Implement token generation logic
    // 1. Construct payload matching QrTokenPayload
    // 2. Sign payload (e.g., using jsonwebtoken)
    // 3. Return the token string
    throw new Error("Not implemented");
  }

  /**
   * Validates a scanned QR token string and decodes its payload
   *
   * @param {string} token - The raw token string scanned from the QR code
   * @returns {Promise<QrTokenPayload>} The decoded payload if valid and signature matches
   * @throws {Error} If token is expired, tampered with, or invalid
   */
  async validateToken(_token) {
    // TODO: Implement token validation logic
    // 1. Verify token signature
    // 2. Check expiration (timestamp)
    // 3. Return decoded QrTokenPayload
    throw new Error("Not implemented");
  }
}

// Export a singleton instance
export const qrService = new QrService();
