import { z } from "zod";
import { systemMessages } from "../config/index.js";

export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(422).json({
        status: "error",
        message: systemMessages.ERROR.GENERAL.VALIDATION_ERROR,
        errors: error.errors,
      });
    }
    next(error);
  }
};

export const validateParams = (schema) => (req, res, next) => {
  try {
    req.params = schema.parse(req.params);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(422).json({
        status: "error",
        message: systemMessages.ERROR.GENERAL.VALIDATION_ERROR,
        errors: error.errors,
      });
    }
    next(error);
  }
};

export const validateQuery = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse(req.query || {});
    Object.defineProperty(req, 'query', {
      value: validated,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(422).json({
        status: "error",
        message: systemMessages.ERROR.GENERAL.VALIDATION_ERROR,
        errors: error.errors,
      });
    }
    next(error);
  }
};
