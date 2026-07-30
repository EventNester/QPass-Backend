import { 
  createTicketType, 
  getTicketTypes, 
  updateTicketType, 
  deleteTicketType,
  getTicketDetails,
  listEventTickets,
  exportEventTickets
} from "./tickets.service.js";
import { success, created } from "../../utils/response.js";

export const createTicketTypeController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.sub; // Extracted from token by requireAuth
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

export const getTicketController = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.sub;
    const ticket = await getTicketDetails(ticketId, userId);
    return success(res, ticket);
  } catch (error) {
    next(error);
  }
};

export const listTicketsController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.sub;
    const result = await listEventTickets(eventId, userId, req.query);
    return success(res, result);
  } catch (error) {
    next(error);
  }
};

export const exportTicketsController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { format } = req.body; // validated by exportTicketSchema
    const userId = req.user.sub;
    
    const { contentType, data, extension } = await exportEventTickets(eventId, userId, format);
    
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="tickets-export.${extension}"`);
    return res.send(data);
  } catch (error) {
    next(error);
  }
};

export const downloadTicketPdfController = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.sub;
    
    const ticket = await getTicketDetails(ticketId, userId);
    const { generateIndividualTicketPdf } = await import("./ticket-pdf.service.js");
    
    const pdfBuffer = await generateIndividualTicketPdf(ticket, ticket.qrDataUrl);
    
    const eventSlug = ticket.event?.slug || 'event';
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${eventSlug}-ticket.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
