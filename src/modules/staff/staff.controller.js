import { assignStaff, listStaff, removeStaff } from "./staff.service.js";
import { success, created } from "../../utils/response.js";
import { systemMessages } from "../../config/index.js";

export async function assignStaffController(req, res, next) {
  try {
    const { eventId } = req.params;
    const assignment = await assignStaff(eventId, req.user.sub, req.body);
    return created(res, assignment, systemMessages.SUCCESS.STAFF.ASSIGNED);
  } catch (error) {
    next(error);
  }
}

export async function listStaffController(req, res, next) {
  try {
    const { eventId } = req.params;
    const staff = await listStaff(eventId, req.user.sub);
    return success(res, staff, systemMessages.SUCCESS.STAFF.LISTED);
  } catch (error) {
    next(error);
  }
}

export async function removeStaffController(req, res, next) {
  try {
    const { eventId, staffId } = req.params;
    const result = await removeStaff(eventId, staffId, req.user.sub);
    return success(res, result, systemMessages.SUCCESS.STAFF.REMOVED);
  } catch (error) {
    next(error);
  }
}
