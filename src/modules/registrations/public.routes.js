import { Router } from 'express';
import { validate, validateParams } from '../../middlewares/validate.middleware.js';
import { success, created } from '../../utils/response.js';
import { systemMessages } from '../../config/index.js';
import { getPublicEventBySlug, registerFree } from './registration.service.js';
import { publicEventSlugSchema, freeRegistrationSchema } from './public.schema.js';

const router = Router();

/**
 * Shape an event record for the public event view. Only publicly safe fields
 * are exposed; ownerId and audit-related fields stay server-side.
 * @param {Object} event - Event record with `ticketTypes`
 * @returns {Object} Public-facing event payload
 */
function publicEventPayload(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    venue: event.venue,
    slug: event.slug,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status,
    registrationMode: event.registrationMode,
    isPaid: event.isPaid,
    capacity: event.capacity,
    currency: event.currency,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    ticketTypes: event.ticketTypes,
  };
}

/**
 * @openapi
 * /api/v1/e/{slug}:
 *   get:
 *     summary: Get a public event by slug
 *     description: |
 *       Returns an open event's details and its active ticket types.
 *       No authentication required.
 *     tags: [Registrations]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Public event slug
 *     responses:
 *       200:
 *         description: Event details and ticket types
 *       404:
 *         description: Event not found or not publicly viewable
 */
router.get('/:slug', validateParams(publicEventSlugSchema), async (req, res, next) => {
  try {
    const event = await getPublicEventBySlug(req.params.slug);
    success(res, publicEventPayload(event));
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/registrations/free:
 *   post:
 *     summary: Register for a free event
 *     description: |
 *       Creates a CONFIRMED registration with a QR token for a free public
 *       event. Confirmation and QR emails are sent to the attendee.
 *       No authentication required.
 *     tags: [Registrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, name, email]
 *             properties:
 *               slug:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               ticketTypeId:
 *                 type: string
 *                 format: uuid
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Registration confirmed with QR
 *       400:
 *         description: Event closed, capacity full, or invalid ticket type
 *       409:
 *         description: Attendee already registered for this event
 *       422:
 *         description: Validation error
 */
router.post('/free', validate(freeRegistrationSchema), async (req, res, next) => {
  try {
    const result = await registerFree(req.body);
    created(res, result, systemMessages.SUCCESS.REGISTRATION.CONFIRMED);
  } catch (error) {
    next(error);
  }
});

export default router;
