import { success } from "../../utils/response.js";
import { listAuditLogs } from "./audit.service.js";

export const listAuditLogsController = async (req, res, next) => {
  try {
    const result = await listAuditLogs(req.query);
    return success(res, result);
  } catch (error) {
    next(error);
  }
};
