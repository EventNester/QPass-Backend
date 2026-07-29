import * as checkinService from "./checkins.service.js";
import { success } from "../../utils/response.js";

export async function scanQr(req, res, next) {
  try {
    const result = await checkinService.scanQr(req.params.eventId, req.body, req.user.sub);
    return success(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function getCheckins(req, res, next) {
  try {
    const result = await checkinService.getCheckins(req.params.eventId, req.user.sub);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function undoCheckin(req, res, next) {
  try {
    const result = await checkinService.undoCheckin(req.params.eventId, req.params.checkInId, req.user.sub);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}
