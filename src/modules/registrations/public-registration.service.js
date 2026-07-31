import prisma from "../../database/index.js";
import { randomBytes } from "crypto";

import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../utils/error.js";

import { qrService } from "../tickets/qr.service.js";
import { sendNotification } from "../../services/notification.service.js";
import { systemMessages } from "../../config/index.js";

const msg = systemMessages.ERROR;

/**
 * Generate attendee confirmation code
 * Example:
 * A81FBC12
 */
function generateConfirmationCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

/**
 * Generate ticket code
 * Example:
 * QP-92A1FD
 */
function generateTicketCode() {
  return `QP-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Public Registration
 */
export async function registerForEvent(slug, payload) {
  const {
    attendeeName,
    attendeeEmail,
    phone,
    ticketTypeId,
  } = payload;

  //---------------------------------------------------
  // Find Event
  //---------------------------------------------------

  const event = await prisma.event.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: "PUBLISHED",
    },
    include: {
      ticketTypes: true,
    },
  });

  if (!event) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  //---------------------------------------------------
  // Registration window validation
  //---------------------------------------------------

  const now = new Date();

  if (
    event.registrationOpensAt &&
    now < event.registrationOpensAt
  ) {
    throw new BadRequestError(
      "Registration has not opened yet."
    );
  }

  if (
    event.registrationClosesAt &&
    now > event.registrationClosesAt
  ) {
    throw new BadRequestError(
      "Registration has closed."
    );
  }

  //---------------------------------------------------
  // Event Capacity
  //---------------------------------------------------

  if (event.capacity !== null) {
    const registrations = await prisma.registration.count({
      where: {
        eventId: event.id,
      },
    });

    if (registrations >= event.capacity) {
      throw new ConflictError(
        "msg.REGISTRATION.EVENT_FULL"
      );
    }
  }

  //---------------------------------------------------
  // Ticket Type
  //---------------------------------------------------

  const ticketType = await prisma.ticketType.findFirst({
    where: {
      id: ticketTypeId,
      eventId: event.id,
      active: true,
    },
  });

  if (!ticketType) {
    throw new NotFoundError(
      "Ticket type not found."
    );
  }

  //---------------------------------------------------
  // Ticket Capacity
  //---------------------------------------------------

  if (
    ticketType.capacity !== null &&
    ticketType.quantitySold >= ticketType.capacity
  ) {
    throw new ConflictError(
      "msg.REGISTRATION.TICKET_TYPE_FULL"
    );
  }

  //---------------------------------------------------
  // Duplicate Registration
  //---------------------------------------------------

  const existingRegistration =
    await prisma.registration.findFirst({
      where: {
        eventId: event.id,
        attendeeEmail: attendeeEmail
          .trim()
          .toLowerCase(),
      },
    });

  if (existingRegistration) {
    throw new ConflictError(
      "msg.REGISTRATION.ALREADY_REGISTERED"
    );
  }

  //---------------------------------------------------
  // Generate Codes
  //---------------------------------------------------

  const confirmationCode =
    generateConfirmationCode();

  const ticketCodeValue =
    generateTicketCode();

      //---------------------------------------------------
  // Database Transaction
  //---------------------------------------------------

  const result = await prisma.$transaction(async (tx) => {
    //---------------------------------------------------
    // Create Ticket Code
    //---------------------------------------------------

    const ticketCode = await tx.ticketCode.create({
      data: {
        eventId: event.id,
        code: ticketCodeValue,
        attendeeName,
        attendeeEmail: attendeeEmail.trim().toLowerCase(),
      },
    });

    //---------------------------------------------------
    // Create Registration
    //---------------------------------------------------

    const registration = await tx.registration.create({
      data: {
        eventId: event.id,
        ticketCodeId: ticketCode.id,
        attendeeName,
        attendeeEmail: attendeeEmail.trim().toLowerCase(),
        phone,
        ticketTypeId,
        confirmationCode,
        source: "PUBLIC_LINK",
        status: "CONFIRMED",
        paymentStatus: event.isPaid ? "PENDING" : "SUCCESS",
      },
      include: {
        ticketCode: true,
        ticketType: true,
      },
    });

    //---------------------------------------------------
    // Increase Ticket Count
    //---------------------------------------------------

    await tx.ticketType.update({
      where: {
        id: ticketType.id,
      },
      data: {
        quantitySold: {
          increment: 1,
        },
      },
    });

    //---------------------------------------------------
    // Generate QR Token
    //---------------------------------------------------

    const expiresAt = new Date(event.endTime);

    // QR remains valid for 24 hours after event ends
    expiresAt.setHours(expiresAt.getHours() + 24);

    const qrToken = await qrService.generateToken(
      registration.id,
      expiresAt
    );

    //---------------------------------------------------
    // Update Registration
    //---------------------------------------------------

    const updatedRegistration = await tx.registration.update({
      where: {
        id: registration.id,
      },
      data: {
        qrIssued: true,
        qrIssuedAt: new Date(),
      },
      include: {
        ticketCode: true,
        ticketType: true,
      },
    });

    const qrImage = await qrService.createQrImage(qrToken);
    //---------------------------------------------------
    // Return everything needed outside transaction
    //---------------------------------------------------

    return {
      registration: updatedRegistration,
      qrImage,
    };
  });

  const { registration, qrImage } = result;

  //---------------------------------------------------
  // Send Registration Email
  //---------------------------------------------------

  await sendNotification({
    recipient: registration.attendeeEmail,
    subject: `Registration Confirmed - ${event.title}`,
    template: "registration",
    eventId: event.id,
    registrationId: registration.id,
    context: {
      attendeeName: registration.attendeeName,
      attendeeEmail: registration.attendeeEmail,
      confirmationCode: registration.confirmationCode,
      ticketCode: registration.ticketCode.code,
      ticketType: registration.ticketType?.name,
      eventTitle: event.title,
      venue: event.venue,
      startTime: event.startTime,
      endTime: event.endTime,
      qrToken,
    },
  });

    //---------------------------------------------------
  // Return Response
  //---------------------------------------------------

  return {
    message: "Registration completed successfully.",
    registration,
      qrImage: qrImage.toString("base64"),
  };
}