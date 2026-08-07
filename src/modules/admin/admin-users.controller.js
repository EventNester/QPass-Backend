import { success, created } from "../../utils/response.js";
import { systemMessages } from "../../config/index.js";
import {
  sendAdminInvite,
  acceptAdminInvite,
  promoteToAdmin,
  listUsers,
  deactivateUser,
} from "./admin-users.service.js";

export async function sendAdminInviteController(req, res, next) {
  try {
    const result = await sendAdminInvite(req.body, req.user.sub);
    if (result && result.success === false) {
      return next(new Error(systemMessages.ERROR.EMAIL.FAILED));
    }
    return created(res, result, systemMessages.SUCCESS.ADMIN.INVITE_SENT);
  } catch (error) {
    return next(error);
  }
}

export async function acceptAdminInviteController(req, res, next) {
  try {
    const user = await acceptAdminInvite({ token: req.params.token, ...req.body });
    return success(res, user, systemMessages.SUCCESS.ADMIN.INVITE_ACCEPTED);
  } catch (error) {
    return next(error);
  }
}

export async function promoteAdminController(req, res, next) {
  try {
    const user = await promoteToAdmin(req.params.userId, req.user.sub);
    return success(res, user, systemMessages.SUCCESS.ADMIN.USER_PROMOTED);
  } catch (error) {
    return next(error);
  }
}

export async function listUsersController(req, res, next) {
  try {
    const result = await listUsers(req.query);
    return success(res, result, systemMessages.SUCCESS.ADMIN.USER_LISTED);
  } catch (error) {
    return next(error);
  }
}

export async function deactivateUserController(req, res, next) {
  try {
    const user = await deactivateUser(req.params, req.user.sub);
    return success(res, user, systemMessages.SUCCESS.ADMIN.USER_DEACTIVATED);
  } catch (error) {
    return next(error);
  }
}
