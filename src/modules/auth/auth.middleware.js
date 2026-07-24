import { validateToken, isTokenBlacklisted } from "./auth.service.js";
import { systemMessages } from "../../config/index.js";

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    }

    const token = authHeader.split(" ")[1];
    
    // Check if token has been logged out/blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    }

    const decoded = validateToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
  }
};
