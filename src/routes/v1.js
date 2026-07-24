import { Router } from "express";
import eventRoutes from "../modules/events/event.routes.js";

const router = Router();

router.use("/events", eventRoutes);

export default router;
