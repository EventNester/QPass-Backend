import { assignStaff, listStaff, removeStaff } from "./staff.service.js";
import { assignStaffSchema } from "./staff.schema.js";
import { success, created } from "../../utils/response.js";
import { ValidationError } from "../../utils/error.js";
import { systemMessages } from "../../config/index.js";

export async function assignStaffController(req, res, next) {
  try {
    const { eventId } = req.params;
    const parsed = assignStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const assignment = await assignStaff(eventId, req.user.id, parsed.data);
    return created(res, assignment, systemMessages.SUCCESS.STAFF.ASSIGNED);
  } catch (error) {
    next(error);
  }
}

export async function listStaffController(req, res, next) {
  try {
    const { eventId } = req.params;
    const staff = await listStaff(eventId, req.user.id);
    return success(res, staff, systemMessages.SUCCESS.STAFF.LISTED);
  } catch (error) {
    next(error);
  }
}

export async function removeStaffController(req, res, next) {
  try {
    const { eventId, staffId } = req.params;
    const result = await removeStaff(eventId, staffId, req.user.id);
    return success(res, result, systemMessages.SUCCESS.STAFF.REMOVED);
  } catch (error) {
    next(error);
  }
}
