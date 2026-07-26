import express from "express";
import helmet from "helmet";
import cors from "cors";
import { getConfig, systemMessages, logger } from "./config/index.js";
import httpLogger from "./middlewares/logging.middleware.js";
import { globalLimiter } from "./middlewares/rate-limit.middleware.js";
import router from "./routes/index.js";
import { AppError } from "./utils/error.js";

const config = getConfig();
const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(globalLimiter);
app.use(httpLogger);
app.use(express.json());

app.use(router);

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: systemMessages.ERROR.GENERAL.ROUTE_NOT_FOUND,
  });
});

app.use((err, req, res, _next) => {
  logger.error(err);

  const isValidStatus =
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 600;

  const isAppError = err instanceof AppError;

  res.status(isValidStatus ? err.status : 500).json({
    status: "error",
    message: isAppError ? err.message : systemMessages.ERROR.GENERAL.INTERNAL_ERROR,
  });
});

export default app;