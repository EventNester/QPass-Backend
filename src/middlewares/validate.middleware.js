import { z } from "zod";

export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(422).json({
        status: "error",
        message: "Validation error",
        errors: error.errors,
      });
    }
    next(error);
  }
};
