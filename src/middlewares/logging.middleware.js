import pinoHttp from "pino-http";
import { logger } from "../config/index.js";

const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
});

export default httpLogger;
