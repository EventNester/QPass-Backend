import { systemMessages } from "../../config/index.js";
// Explicit alias map for column header normalization.
// Prevents greedy .includes() matches (e.g. "filename" matching "name").
const KEY_MAP = {
  name: ["name", "attendeename", "attendee_name", "fullname", "full_name"],
  email: [
    "email",
    "attendeeemail",
    "attendee_email",
    "emailaddress",
    "email_address",
    "e-mail",
  ],
  phone: [
    "phone",
    "phonenumber",
    "phone_number",
    "mobile",
    "mobilenumber",
    "mobile_number",
    "tel",
    "telephone",
  ],
  ticketType: [
    "tickettype",
    "ticket_type",
    "ticket",
    "type",
    "category",
    "tier",
  ],
  organization: [
    "organization",
    "organisation",
    "org",
    "company",
    "institution",
  ],
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts local and international phone formats (+234..., 080..., etc.)
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

/**
 * Normalizes a raw column header to one of the known field names
 * (name, email, phone, ticketType, organization) using the alias map.
 *
 * @param {string} rawKey - The raw column header string.
 * @returns {string|null} The normalized field name, or null if unrecognised.
 */
function normalizeKey(rawKey) {
  if (!rawKey) return null;
  const cleaned = rawKey.toLowerCase().replace(/[\s_-]+/g, "");
  for (const [field, aliases] of Object.entries(KEY_MAP)) {
    if (aliases.some((a) => a.replace(/[\s_-]+/g, "") === cleaned)) {
      return field;
    }
  }
  return null;
}

/**
 * Validates an array of parsed rows, normalizes fields, and flags duplicates.
 *
 * Checks:
 * - `name` is required
 * - At least one of `email` or `phone` is required (per TRD §6.1)
 * - Valid email format (if provided)
 * - Valid phone format (if provided)
 * - No duplicate email/phone within the batch
 * - No duplicate email/phone against existing event registrations
 * - TicketType matches an existing type for the event (if provided)
 * - Capacity is not exceeded
 *
 * @param {Array<Object>} rows - Array of raw row objects from the parser.
 * @param {Object} [options] - Validation context.
 * @param {string[]} [options.validTicketTypes] - Valid ticket type names for the event.
 * @param {Set<string>} [options.existingEmails] - Emails already registered for the event.
 * @param {Set<string>} [options.existingPhones] - Phones already registered for the event.
 * @param {number|null} [options.remainingCapacity] - Remaining event capacity (null = unlimited).
 * @returns {Object} { validRows: Array, errors: Array }
 */
export function validateRows(rows, options = {}) {
  const {
    validTicketTypes = [],
    existingEmails = new Set(),
    existingPhones = new Set(),
    remainingCapacity = null,
  } = options;

  const validRows = [];
  const errors = [];
  const seenEmails = new Set();
  const seenPhones = new Set();

  const msg = systemMessages.VALIDATION.IMPORT;

  rows.forEach((row, index) => {
    // 1-indexed for user-friendly error messages
    const rowNumber = index + 1;

    // Normalize column headers using the explicit alias map
    const normalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
      const field = normalizeKey(key);
      if (field) {
        const hasVal =
          value !== null &&
          value !== undefined &&
          value.toString().trim() !== "";
        // Preserve non-empty value if multiple columns map to the same field
        if (!normalizedRow[field] || hasVal) {
          normalizedRow[field] = value;
        }
      }
    }

    // Extract and clean field values
    const name = (normalizedRow.name || "").toString().trim();
    const email = (normalizedRow.email || "").toString().trim().toLowerCase();
    const phone = (normalizedRow.phone || "")
      .toString()
      .trim()
      .replace(/[\s\-()]/g, "");
    const ticketType = (normalizedRow.ticketType || "").toString().trim();
    const organization = (normalizedRow.organization || "").toString().trim();

    // Skip truly empty rows silently
    if (!name && !email && !phone) {
      const hasContent = Object.values(row).some(
        (v) => v !== null && v !== undefined && v.toString().trim() !== ""
      );
      if (hasContent) {
        errors.push({ row: rowNumber, field: "row", error: msg.EMPTY_ROW });
      }
      return;
    }

    // Name is always required
    if (!name) {
      errors.push({ row: rowNumber, field: "name", error: msg.NAME_REQUIRED });
      return;
    }

    // At least one of email or phone required (TRD §6.1)
    if (!email && !phone) {
      errors.push({
        row: rowNumber,
        field: "email, phone",
        error: msg.CONTACT_REQUIRED,
      });
      return;
    }

    // Validate email format if provided
    if (email && !EMAIL_REGEX.test(email)) {
      errors.push({
        row: rowNumber,
        field: "email",
        error: msg.INVALID_EMAIL,
      });
      return;
    }

    // Validate phone format if provided
    if (phone && !PHONE_REGEX.test(phone)) {
      errors.push({
        row: rowNumber,
        field: "phone",
        error: msg.INVALID_PHONE,
      });
      return;
    }

    // Check duplicate email within this batch
    if (email && seenEmails.has(email)) {
      errors.push({
        row: rowNumber,
        field: "email",
        error: msg.DUPLICATE_EMAIL,
      });
      return;
    }

    // Check duplicate phone within this batch
    if (phone && seenPhones.has(phone)) {
      errors.push({
        row: rowNumber,
        field: "phone",
        error: msg.DUPLICATE_PHONE,
      });
      return;
    }

    // Check duplicate email against existing event registrations
    if (email && existingEmails.has(email)) {
      errors.push({
        row: rowNumber,
        field: "email",
        error: msg.DUPLICATE_EMAIL_EVENT,
      });
      return;
    }

    // Check duplicate phone against existing event registrations
    if (phone && existingPhones.has(phone)) {
      errors.push({
        row: rowNumber,
        field: "phone",
        error: msg.DUPLICATE_PHONE_EVENT,
      });
      return;
    }

    // Validate ticketType against event's actual ticket types (case-insensitive)
    let finalTicketType = ticketType || null;
    if (ticketType && validTicketTypes.length > 0) {
      const matched = validTicketTypes.find(
        (t) => t.toLowerCase() === ticketType.toLowerCase()
      );
      if (!matched) {
        errors.push({
          row: rowNumber,
          field: "ticketType",
          error: `${msg.UNKNOWN_TICKET_TYPE}: "${ticketType}"`,
        });
        return;
      }
      finalTicketType = matched;
    }

    // Check capacity (count valid rows accepted so far)
    if (remainingCapacity !== null && validRows.length >= remainingCapacity) {
      errors.push({
        row: rowNumber,
        field: "capacity",
        error: msg.CAPACITY_EXCEEDED,
      });
      return;
    }

    // Track seen values for intra-batch duplicate detection
    if (email) seenEmails.add(email);
    if (phone) seenPhones.add(phone);

    validRows.push({
      name,
      email: email || null,
      phone: phone || null,
      ticketType: finalTicketType,
      organization: organization || null,
    });
  });

  return { validRows, errors };
}
