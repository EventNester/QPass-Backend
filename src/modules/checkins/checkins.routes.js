import { Router } from "express";
import * as checkinController from "./checkins.controller.js";
import { scanQrSchema } from "./checkins.schema.js";

const router = Router();

router.post("/:eventId/scan", checkinController.scanQr);
router.get("/:eventId/checkins", checkinController.getCheckins);
router.post("/:eventId/checkins/:checkInId/undo", checkinController.undoCheckin);

export default router;
