import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import healthRouter from "./health.js";
import v1Router from "./v1.js";
import { swaggerSpec, getConfig } from "../config/index.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/api/v1", v1Router);

const config = getConfig();
if (config.SWAGGER_ENABLED) {
  router.get("/api-docs.json", (req, res) => {
    res.json(swaggerSpec);
  });
  router.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
export default router;
