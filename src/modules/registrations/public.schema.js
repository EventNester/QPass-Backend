import { z } from 'zod';

export const publicEventSlugSchema = z.object({
  slug: z.string().min(1, 'Event slug is required').max(300),
});

export const freeRegistrationSchema = z.object({
  slug: z.string().min(1, 'Event slug is required').max(300),
  name: z.string().min(1, 'Attendee name is required').max(200),
  email: z.string().email('Invalid email address').max(254),
  phone: z.string().max(30).optional(),
  ticketTypeId: z.string().uuid('Invalid ticket type ID').optional(),
  metadata: z.record(z.unknown()).optional(),
});
