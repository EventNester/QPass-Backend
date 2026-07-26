import { Router } from "express";
import eventRoutes from "../modules/events/event.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import checkinsRouter from "../modules/checkins/checkins.routes.js";

const router = Router();

router.use("/events", eventRoutes);
router.use("/auth", authRoutes);
router.use("/checkins", checkinsRouter);

export default router;
