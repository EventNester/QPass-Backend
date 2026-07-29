import { Router } from "express";
import {
  assignStaffController,
  listStaffController,
  removeStaffController,
} from "./staff.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { assignStaffSchema } from "./staff.schema.js";

const router = Router();

router.post("/:eventId/staff", requireAuth, requireRole("ORGANIZER"), validate(assignStaffSchema), assignStaffController);

router.get("/:eventId/staff", requireAuth, requireRole("ORGANIZER"), listStaffController);

router.delete("/:eventId/staff/:staffId", requireAuth, requireRole("ORGANIZER"), removeStaffController);

export default router;
