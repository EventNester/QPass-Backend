import systemMessages from "../config/system_messages.js";

const msg = systemMessages.ERROR;

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = msg.GENERAL.NOT_FOUND) {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = msg.GENERAL.ALREADY_EXISTS) {
    super(message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = msg.AUTH.UNAUTHORIZED) {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = msg.AUTH.FORBIDDEN) {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = msg.GENERAL.VALIDATION_ERROR) {
    super(message, 422);
  }
}
