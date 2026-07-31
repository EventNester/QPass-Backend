import { Router } from "express";

import {
  getPublicEventController,
  registerForPublicEventController,
} from "./public-registration.controller.js";

import {
  publicEventParamsSchema,
  publicRegistrationParamsSchema,
  publicRegistrationSchema,
} from "./public-registration.schema.js";

import {
  validate,
  validateParams,
} from "../../middlewares/validate.middleware.js";

const router = Router();

/**
 * GET /api/v1/public/events/:slug
 */
router.get(
  "/events/:slug",
  validateParams(publicEventParamsSchema),
  getPublicEventController
);

/**
 * POST /api/v1/public/events/:slug/register
 */
router.post(
  "/events/:slug/register",
  validateParams(publicRegistrationParamsSchema),
  validate(publicRegistrationSchema),
  registerForPublicEventController
);

export default router;