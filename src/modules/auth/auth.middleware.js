import { validateToken } from "./auth.service.js";
import { systemMessages } from "../../config/index.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    }

    const token = authHeader.split(" ")[1];

    const decoded = validateToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
  }
};
