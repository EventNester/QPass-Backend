import { validateToken } from "./auth.service.js";
import prisma from "../../database/index.js";
import { systemMessages } from "../../config/index.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    }

    const token = authHeader.split(" ")[1];

    const decoded = validateToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    }

    req.user = { ...decoded, id: decoded.sub };
    next();
  } catch {
    return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
  }
};
