import { 
  createTicketType, 
  getTicketTypes, 
  updateTicketType, 
  deleteTicketType 
} from "./tickets.service.js";
import { generateTicketPdf } from "./ticket-pdf.service.js";
import { createRegistrationCsvStream } from "./ticket-export.service.js";
import { success, created } from "../../utils/response.js";

export const createTicketTypeController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.sub;
    const ticketType = await createTicketType(eventId, userId, req.body);
    return created(res, ticketType, "Ticket type created successfully");
  } catch (error) {
    next(error);
  }
};

export const getTicketTypesController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.sub;
    const ticketTypes = await getTicketTypes(eventId, userId);
    return success(res, ticketTypes);
  } catch (error) {
    next(error);
  }
};

export const updateTicketTypeController = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;
    const userId = req.user.sub;
    const ticketType = await updateTicketType(eventId, id, userId, req.body);
    return success(res, ticketType, "Ticket type updated successfully");
  } catch (error) {
    next(error);
  }
};

export const deleteTicketTypeController = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;
    const userId = req.user.sub;
    await deleteTicketType(eventId, id, userId);
    return success(res, null, "Ticket type deleted successfully");
  } catch (error) {
    next(error);
  }
};

export const downloadTicketController = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.sub;
    const doc = await generateTicketPdf(ticketId, userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketId}.pdf"`);
    doc.on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
};
export const exportTicketsController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.sub;
    const stream = await createRegistrationCsvStream(eventId, userId);
    const filename = `registrations-${eventId}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
};
