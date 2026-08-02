import { describe, test, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from "../error.js";

describe("AppError", () => {
  test("defaults to status 500 with class name", () => {
    const err = new AppError("Something broke");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("AppError");
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something broke");
  });

  test("uses custom status code", () => {
    const err = new AppError("Bad", 418);

    expect(err.status).toBe(418);
  });

  test("captures a stack trace", () => {
    const err = new AppError("Boom");

    expect(typeof err.stack).toBe("string");
  });
});

describe("Subclass error types", () => {
  test("NotFoundError has status 404 and default message", () => {
    const err = new NotFoundError();

    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("NotFoundError");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Resource not found");
  });

  test("NotFoundError uses provided message", () => {
    const err = new NotFoundError("Missing ticket");

    expect(err.message).toBe("Missing ticket");
  });

  test("BadRequestError has status 400", () => {
    const err = new BadRequestError("Bad request");

    expect(err.status).toBe(400);
  });

  test("BadRequestError has a default message", () => {
    const err = new BadRequestError();

    expect(err.message).toBe("Bad request");
  });

  test("ConflictError has status 409 and default message", () => {
    const err = new ConflictError();

    expect(err.status).toBe(409);
    expect(err.message).toBe("Resource already exists");
  });

  test("UnauthorizedError has status 401 and default message", () => {
    const err = new UnauthorizedError();

    expect(err.status).toBe(401);
    expect(err.message).toBe("Unauthorized access");
  });

  test("ForbiddenError has status 403 and default message", () => {
    const err = new ForbiddenError();

    expect(err.status).toBe(403);
    expect(err.message).toBe("Access forbidden");
  });

  test("ValidationError has status 422 and default message", () => {
    const err = new ValidationError();

    expect(err.status).toBe(422);
    expect(err.message).toBe("Validation error");
  });
});
