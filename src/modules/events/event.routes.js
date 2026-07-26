import { Router } from "express";

import {
  createEventController,
  getEventController,
  listEventsController,
  updateEventController,
  deleteEventController,
} from "./event.controller.js";

const router = Router();

router.post("/", createEventController);

router.get("/", listEventsController);

router.get("/:id", getEventController);

router.patch("/:id", updateEventController);

router.delete("/:id", deleteEventController);

export default router;
