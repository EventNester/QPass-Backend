import { Router } from "express";

import {
  createEventController,
  getEventController,
  listEventsController,
  updateEventController,
  deleteEventController,
  publishEventController,
  cancelEventController,
} from "./event.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";

const router = Router();

// Create Event
router.post("/", requireAuth, createEventController);

// List Events
router.get("/", listEventsController);

// Publish Event
router.post("/:id/publish", requireAuth, publishEventController);

// cancel Event
router.post("/:id/cancel", requireAuth, cancelEventController);

// Get One Event
router.get("/:id", getEventController);

// Update Event
router.patch("/:id", requireAuth, updateEventController);

// Delete Event
router.delete("/:id", requireAuth, deleteEventController);

export default router;