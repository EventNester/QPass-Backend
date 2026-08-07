import {
  createEvent,
  getEvent,
  listEvents,
  listAssignedEvents,
  updateEvent,
  deleteEvent,
  publishEvent,
  unpublishEvent,
  cancelEvent,
} from "./event.service.js";

import {
  createEventSchema,
  updateEventSchema,
} from "./event.schema.js";

import { success, created } from "../../utils/response.js";
import { ValidationError } from "../../utils/error.js";
import { systemMessages } from "../../config/index.js";

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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseEventIdOrNext = (id, next) => {
  if (!UUID_REGEX.test(id)) {
    next(new ValidationError("Invalid event ID format"));
    return null;
  }

  return id;
};

// Create event
export const createEventController = async (req, res, next) => {
  try {
    const validatedData = parseOrNext(createEventSchema, req.body, next);
    if (!validatedData) return;

    const event = await createEvent(validatedData, req.user.sub);

    return created(res, event, systemMessages.SUCCESS.EVENT.CREATED);
  } catch (error) {
    next(error);
  }
};

// Get event
export const getEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await getEvent(id, req.user.id, req.user.role);

    return success(res, event);
  } catch (error) {
    next(error);
  }
};

// List events the caller is assigned to as staff
export const listAssignedEventsController = async (req, res, next) => {
  try {
    const result = await listAssignedEvents(req.user.sub);

    return success(res, result);
  } catch (error) {
    next(error);
  }
};

// List events
export const listEventsController = async (req, res, next) => {
  try {
    const result = await listEvents(req.user.id, req.user.role, req.query);

    return success(res, result);
  } catch (error) {
    next(error);
  }
};

// Update event
export const updateEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const validatedData = parseOrNext(updateEventSchema, req.body, next);
    if (!validatedData) return;

    const event = await updateEvent(id, validatedData, req.user.sub, req.user.role);

    return success(res, event, systemMessages.SUCCESS.EVENT.UPDATED);
  } catch (error) {
    next(error);
  }
};

// Delete event
export const deleteEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await deleteEvent(id, req.user.sub, req.user.role);

    return success(res, event, systemMessages.SUCCESS.EVENT.DELETED);
  } catch (error) {
    next(error);
  }
};

// Publish event
export const publishEventController = async (req, res, next) => {
  try {
    const eventId = parseEventIdOrNext(req.params.id, next);
    if (!eventId) return;

    const event = await publishEvent(eventId, req.user.sub, req.user.role);

    return success(
      res,
      event,
      systemMessages.SUCCESS.EVENT.PUBLISHED
    );
  } catch (error) {
    next(error);
  }
};


// Unpublish event
export const unpublishEventController = async (req, res, next) => {
  try {
    const eventId = parseEventIdOrNext(req.params.id, next);
    if (!eventId) return;

    const event = await unpublishEvent(eventId, req.user.sub, req.user.role);

    return success(
      res,
      event,
      systemMessages.SUCCESS.EVENT.UNPUBLISHED
    );
  } catch (error) {
    next(error);
  }
};

// Cancel event
export const cancelEventController = async (req, res, next) => {
  try {
    const eventId = parseEventIdOrNext(req.params.id, next);
    if (!eventId) return;

    const event = await cancelEvent(eventId, req.user.sub, req.user.role);

    return success(
      res,
      event,
      systemMessages.SUCCESS.EVENT.CANCELLED
    );
  } catch (error) {
    next(error);
  }
};