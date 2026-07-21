import { systemMessages } from "../config/index.js";

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ status: "error", message: systemMessages.ERROR.AUTH.FORBIDDEN });
    }

    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
  }
  next();
}
