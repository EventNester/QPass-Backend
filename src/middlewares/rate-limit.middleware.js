import rateLimit from "express-rate-limit";
import { constants, systemMessages } from "../config/index.js";

const msg = systemMessages.ERROR;

export const globalLimiter = rateLimit({
  windowMs: constants.RATE_LIMIT.WINDOW_MS,
  max: constants.RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.url === "/health",
  message: {
    status: "error",
    message: msg.GENERAL.TOO_MANY_REQUESTS,
  },
});

export const authLimiter = rateLimit({
  windowMs: constants.RATE_LIMIT.WINDOW_MS,
  max: constants.RATE_LIMIT.LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: msg.AUTH.TOO_MANY_ATTEMPTS,
  },
});
