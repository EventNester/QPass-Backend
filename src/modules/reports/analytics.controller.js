import { success } from "../../utils/response.js";
import { getOverviewStats } from "./analytics.service.js";

export const getOverviewStatsController = async (req, res, next) => {
  try {
    const stats = await getOverviewStats(req.user.id, req.user.role, {
      scope: req.query.scope,
    });
    return success(res, stats);
  } catch (error) {
    next(error);
  }
};
