import swaggerJsdoc from "swagger-jsdoc";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFINITION_PATH = join(__dirname, "../../swagger.json");

const FALLBACK_DEFINITION = {
  openapi: "3.0.0",
  info: { title: "API", version: "0.0.0" },
};

let definition = FALLBACK_DEFINITION;
if (!existsSync(DEFINITION_PATH)) {
  logger.warn(`Swagger definition not found at ${DEFINITION_PATH}. Docs will be empty.`);
} else {
  try {
    definition = JSON.parse(readFileSync(DEFINITION_PATH, "utf-8"));
  } catch (err) {
    logger.error(`Failed to parse Swagger definition at ${DEFINITION_PATH}: ${err.message}`);
  }
}
const options = {
  definition,
  apis: [
    join(__dirname, "../routes/*.js").replace(/\\/g, "/"),
    join(__dirname, "../modules/*/*.routes.js").replace(/\\/g, "/"),
  ],
};

export default swaggerJsdoc(options);
