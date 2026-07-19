const express = require("express");
const checkinController = require("./checkins.controller");
const validate = require("../../middlewares/validation.middleware");
const { scanQrSchema } = require("./checkins.schema");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");

const router = express.Router();

router.post(
  "/:eventId/scan",
  authenticate,
  authorize("STAFF", "ADMIN"),
  validate(scanQrSchema),
  checkinController.scanQr
);

router.get("/:eventId/checkins", authenticate, checkinController.getCheckins);

router.post(
  "/:eventId/checkins/:checkInId/undo",
  authenticate,
  authorize("ADMIN"),
  checkinController.undoCheckin
);

module.exports = router;
