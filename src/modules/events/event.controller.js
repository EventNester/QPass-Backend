import {
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
} from "./event.service.js";

import {
  createEventSchema,
  updateEventSchema,
} from "./event.schema.js";

// Create event
export const createEventController = async (req, res, next) => {
  try {
    const validatedData = createEventSchema.parse(req.body);

    const { ownerId } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: "ownerId is required until authentication is implemented",
      });
    }

    const event = await createEvent(validatedData, ownerId);

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// Get event
export const getEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await getEvent(id);

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// Update event
export const updateEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const validatedData = updateEventSchema.parse(req.body);

    const { ownerId } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: "ownerId is required until authentication is implemented",
      });
    }

    const event = await updateEvent(id, validatedData, ownerId);

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// Delete event
export const deleteEventController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { ownerId } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: "ownerId is required until authentication is implemented",
      });
    }

    const event = await deleteEvent(id, ownerId);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};