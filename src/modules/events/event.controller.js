import {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent,
} from "./event.service.js";

import {
  createEventSchema,
  updateEventSchema,
} from "./event.schema.js";

import { success, created } from "../../utils/response.js";
import { ValidationError } from "../../utils/error.js";

const getOwnerId = (req) => req.user?.id || process.env.DEFAULT_OWNER_ID;

const parseOrNext = (schema, body, next) => {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err.name === "ZodError") {
      return next(new ValidationError(err.errors.map((e) => e.message).join(", ")));
    }
    return next(err);
  }
};

// Create event
export const createEventController = async (req, res, next) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const validatedData = parseOrNext(createEventSchema, req.body, next);
    if (!validatedData) return;

    const event = await createEvent(validatedData, ownerId);

    return created(res, event, "Event created successfully");
  } catch (error) {
    next(error);
  }
};

// Get event
export const getEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await getEvent(id);

    return success(res, event);
  } catch (error) {
    next(error);
  }
};

// List events
export const listEventsController = async (req, res, next) => {
  try {
    const events = await listEvents();

    return success(res, events);
  } catch (error) {
    next(error);
  }
};

// Update event
export const updateEventController = async (req, res, next) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    const validatedData = parseOrNext(updateEventSchema, req.body, next);
    if (!validatedData) return;

    const event = await updateEvent(id, validatedData, ownerId);

    return success(res, event, "Event updated successfully");
  } catch (error) {
    next(error);
  }
};

// Delete event
export const deleteEventController = async (req, res, next) => {
  try {
    const ownerId = getOwnerId(req);
    if (!ownerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    const event = await deleteEvent(id, ownerId);

    return success(res, event, "Event deleted successfully");
  } catch (error) {
    next(error);
  }
};
