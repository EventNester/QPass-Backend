/**
 * Extracts attendee row objects from raw text by detecting lines that contain
 * an email or phone pattern. Shared by the PDF parser and the DOCX fallback
 * to avoid duplicating the same heuristic logic.
 *
 * @param {string} text - Raw text content (from pdf-parse or mammoth.extractRawText).
 * @returns {Array<Object>} Array of { name, email, phone, ticketType } objects.
 */
export function extractRowsFromText(text) {
  const lines = text.split(/\r?\n/);
  const records = [];

  // Matches standard email addresses including + aliases
  const emailRegex = /([a-zA-Z0-9.+_-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)/;

  // Matches local and international phone numbers (e.g. +1 (555) 123-4567, (555).123.4567)
  const phoneRegex = /(\+?\(?[0-9][\d\s\-.()]{5,14}[0-9])/;

  // Date pattern detector to prevent dates (e.g. 2026-07-29, 12/31/2026) from matching as phones
  const DATE_REGEX = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;

  // Reject phone matches that contain alphabetic characters (e.g. addresses, order IDs)
  const HAS_ALPHA = /[a-zA-Z]/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const emailMatch = trimmed.match(emailRegex);
    let phoneMatch = trimmed.match(phoneRegex);

    // If phone match is actually a date string or contains letters, discard it
    if (phoneMatch) {
      const phoneCandidate = phoneMatch[1].trim();
      if (DATE_REGEX.test(phoneCandidate) || HAS_ALPHA.test(phoneCandidate)) {
        phoneMatch = null;
      }
    }

    // Only process lines that contain at least one contact identifier
    if (!emailMatch && !phoneMatch) continue;

    let name = "";
    let afterContact = "";
    let email = "";
    let phone = "";

    if (emailMatch) {
      email = emailMatch[1];

      // Everything before the email is assumed to be the name
      const beforeEmail = trimmed.substring(0, emailMatch.index).trim();
      // Everything after the email is assumed to be ticketType or organization
      afterContact = trimmed
        .substring(emailMatch.index + email.length)
        .trim();

      name = beforeEmail.replace(/^[-,\s:(]+|[-,\s:)]+$/g, "");

      // Check if a phone number appears in the remainder
      const remainderPhoneMatch = afterContact.match(phoneRegex);
      if (remainderPhoneMatch) {
        const remainderCandidate = remainderPhoneMatch[1].trim();
        if (!DATE_REGEX.test(remainderCandidate) && !HAS_ALPHA.test(remainderCandidate)) {
          phone = remainderPhoneMatch[1].replace(/[\s\-.()]/g, "");
          afterContact = afterContact
            .substring(
              remainderPhoneMatch.index + remainderPhoneMatch[1].length
            )
            .trim();
        }
      }
    } else if (phoneMatch) {
      phone = phoneMatch[1].replace(/[\s\-.()]/g, "");

      // Everything before the phone is assumed to be the name
      const beforePhone = trimmed.substring(0, phoneMatch.index).trim();
      afterContact = trimmed
        .substring(phoneMatch.index + phoneMatch[1].length)
        .trim();

      name = beforePhone.replace(/^[-,\s:(]+|[-,\s:)]+$/g, "");
    }

    const ticketType = afterContact.replace(/^[-,\s]+|[-,\s]+$/g, "");

    records.push({
      name,
      email,
      phone,
      ticketType,
    });
  }

  return records;
}
