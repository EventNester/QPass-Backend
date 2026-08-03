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
import reportDashboardRoutes from "../modules/reports/dashboard.routes.js";
import reportExportRoutes from "../modules/reports/export.routes.js";
import auditRoutes from "../modules/admin/audit.routes.js";

const router = Router();

router.use("/events", eventRoutes);
router.use("/events/:eventId/ticket-types", ticketTypesRouter);
router.use("/events/:eventId/tickets", eventTicketsRouter);
router.use("/tickets", individualTicketsRouter);
router.use("/events", importRoutes);
router.use("/events", staffRoutes);
router.use("/events", reportDashboardRoutes);
router.use("/events", reportExportRoutes);

router.use("/auth", authRoutes);
router.use("/checkins", checkinsRouter);
router.use("/audit-logs", auditRoutes);

// Public registration flow (no auth): GET /e/:slug, POST /registrations/free
router.use("/e", publicEventRouter);
router.use("/registrations", publicRegistrationRouter);

export default router;
