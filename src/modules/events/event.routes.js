import { Router } from "express";

import {
  createEventController,
  getEventController,
  listEventsController,
  updateEventController,
  deleteEventController,
} from "./event.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";

const router = Router();

router.post("/", requireAuth, createEventController);

router.get("/", listEventsController);

router.get("/:id", getEventController);

router.patch("/:id", requireAuth, updateEventController);

router.delete("/:id", requireAuth, deleteEventController);

export default router;
