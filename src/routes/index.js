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
  const apiServers = (req) => [
    {
      url: `${req.get("x-forwarded-proto") || req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`,
      description: "Current host",
    },
  ];

  router.get("/api-docs.json", (req, res) => {
    res.json({ ...swaggerSpec, servers: apiServers(req) });
  });
  router.use("/api-docs", swaggerUi.serve, (req, res, next) =>
    swaggerUi.setup({ ...swaggerSpec, servers: apiServers(req) })(req, res, next)
  );
}
export default router;
