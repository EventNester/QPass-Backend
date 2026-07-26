import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import checkinsRouter from "../modules/checkins/checkins.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/checkins", checkinsRouter);

export default router;
