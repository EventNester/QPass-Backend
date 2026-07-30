import prisma from '../../database/index.js';
import { NotFoundError } from '../../utils/error.js';


/**
 * Get a registration record by its unique ID.
 * @param {string} id - UUID of the registration
 * @returns {Promise<Object>} Registration record with related ticketCode and event
 * @throws {NotFoundError} If registration is not found
 */
export async function getRegistrationById(id) {
  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      ticketCode: true,
      event: true,
    },
  });

  if (!registration) {
    throw new NotFoundError('Registration not found');
  }

  return registration;
}

/**
 * Get a registration by attendee email within an event.
 * @param {string} eventId - UUID of the event
 * @param {string} email - Attendee email
 * @returns {Promise<Object|null>} Matching registration record or null
 */
export async function getRegistrationByEmail(eventId, email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return prisma.registration.findFirst({
    where: {
      eventId,
      attendeeEmail: normalizedEmail,
    },
    include: {
      ticketCode: true,
    },
  });
}

/**
 * List registrations for an event with pagination.
 * @param {string} eventId - UUID of the event
 * @param {number} [page=1] - 1-indexed page number
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<Object>} Paginated result { registrations, pagination }
 */
const MAX_PAGE_SIZE = 100;

export async function listRegistrationsByEvent(eventId, page = 1, limit = 20) {
  const take = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(limit) || 20));
  const currentPage = Math.max(1, Number(page) || 1);
  const skip = (currentPage - 1) * take;

  const [registrations, total] = await Promise.all([
    prisma.registration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        ticketCode: true,
      },
    }),
    prisma.registration.count({
      where: { eventId },
    }),
  ]);

  return {
    registrations,
    pagination: {
      page: currentPage,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },  };
}
