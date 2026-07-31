import { Router } from "express";
import eventRoutes from "../modules/events/event.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import checkinsRouter from "../modules/checkins/checkins.routes.js";
import ticketTypesRouter from "../modules/tickets/tickets.routes.js";
import eventTicketsRouter from "../modules/tickets/event-tickets.routes.js";
import individualTicketsRouter from "../modules/tickets/individual-tickets.routes.js";
import staffRoutes from "../modules/staff/staff.routes.js";
import importRoutes from "../modules/registrations/import.routes.js";
import {
  publicEventRouter,
  publicRegistrationRouter,
} from "../modules/registrations/public.routes.js";
import { requireAuth } from "../modules/auth/auth.middleware.js";
import {
  downloadTicketController,
  exportTicketsController,
} from "../modules/tickets/tickets.controller.js";

const router = Router();

router.use("/events", eventRoutes);
router.use("/events/:eventId/ticket-types", ticketTypesRouter);
router.use("/events/:eventId/tickets", eventTicketsRouter);
router.use("/tickets", individualTicketsRouter);
router.use("/events", importRoutes);
router.use("/events", staffRoutes);

router.use("/auth", authRoutes);
router.use("/checkins", checkinsRouter);

// Public registration flow (no auth): GET /e/:slug, POST /registrations/free
router.use("/e", publicEventRouter);
router.use("/registrations", publicRegistrationRouter);

router.get("/tickets/:ticketId/download", requireAuth, downloadTicketController);
router.post("/events/:eventId/tickets/export", requireAuth, exportTicketsController);

export default router;
