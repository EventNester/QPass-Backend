import { registerForEvent as registerForEventService } from "./public-registration.service.js";
import { created } from "../../utils/response.js";
import { systemMessages } from "../../config/index.js";

export async function registerForEvent(req, res, next) {
  try {
    const { slug } = req.params;

    const result = await registerForEventService(slug, req.body);

    return created(
      res,
      systemMessages.SUCCESS.REGISTRATION.CREATED,
      result
    );
  } catch (error) {
    next(error);
  }
}