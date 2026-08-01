import crypto from "crypto";

export function generateSlug(title) {
  // Convert title to lowercase
  const slug = title
    .toLowerCase()
    // Remove special characters except spaces and hyphens
    .replace(/[^a-z0-9\s-]/g, "")
    // Replace one or more spaces with a single hyphen
    .replace(/\s+/g, "-")
    // Remove duplicate hyphens
    .replace(/-+/g, "-")
    // Remove hyphens at the beginning or end
    .replace(/^-|-$/g, "");

  const base = slug || "untitled";

  // Generate a random 6-character hexadecimal suffix
  const suffix = crypto.randomBytes(3).toString("hex");

  return `${base}-${suffix}`;
}

/**
 * Generate a human-readable confirmation code.
 * @returns {string} Confirmation code in format CONF-XXXXXXXX (8 hex chars)
 */
export function generateConfirmationCode() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CONF-${rand}`;
}