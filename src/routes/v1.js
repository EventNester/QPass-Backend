import { Router } from "express";
import eventRoutes from "../modules/events/event.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import checkinsRouter from "../modules/checkins/checkins.routes.js";
import ticketTypesRouter from "../modules/tickets/tickets.routes.js";
import eventTicketsRouter from "../modules/tickets/event-tickets.routes.js";
import individualTicketsRouter from "../modules/tickets/individual-tickets.routes.js";
import staffRoutes from "../modules/staff/staff.routes.js";
import importRoutes from "../modules/registrations/import.routes.js";

const router = Router();

router.use("/events", eventRoutes);
router.use("/events/:eventId/ticket-types", ticketTypesRouter);
router.use("/events/:eventId/tickets", eventTicketsRouter);
router.use("/tickets", individualTicketsRouter);
router.use("/events", importRoutes);
router.use("/events", staffRoutes);
router.use("/auth", authRoutes);
router.use("/checkins", checkinsRouter);

export default router;
