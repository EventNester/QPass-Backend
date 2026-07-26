import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import checkinsRouter from "../modules/checkins/checkins.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/checkins", checkinsRouter);

export default router;
