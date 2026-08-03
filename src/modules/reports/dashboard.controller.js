import { success } from "../../utils/response.js";
import { getDashboardStats } from "./dashboard.service.js";

export const getDashboardStatsController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const stats = await getDashboardStats(eventId, req.user.id, req.user.role);
    return success(res, stats);
  } catch (error) {
    next(error);
  }
};
