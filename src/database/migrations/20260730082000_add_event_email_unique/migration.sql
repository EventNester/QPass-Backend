-- Drop redundant (eventId, ticketCodeId) unique constraint (ticketCodeId is already unique)
DROP INDEX IF EXISTS "registrations_event_id_ticket_code_id_key";

-- Add unique constraint on (eventId, attendeeEmail) for duplicate detection
CREATE UNIQUE INDEX "registrations_event_id_attendee_email_key" ON "registrations"("event_id", "attendee_email");
