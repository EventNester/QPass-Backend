import { Router } from "express";

import {
  createEventController,
  getEventController,
  updateEventController,
  deleteEventController,
} from "./event.controller.js";

const router = Router();

router.post("/", createEventController);

router.get("/:id", getEventController);

router.put("/:id", updateEventController);

router.delete("/:id", deleteEventController);

export default router;