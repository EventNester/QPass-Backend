import swaggerJsdoc from "swagger-jsdoc";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFINITION_PATH = join(__dirname, "../../docs/swagger-definition.json");

if (!existsSync(DEFINITION_PATH)) {
  logger.error(`Swagger definition file not found at ${DEFINITION_PATH}`);
  process.exit(1);
}

const definition = JSON.parse(readFileSync(DEFINITION_PATH, "utf-8"));

const options = {
  definition,
  apis: [
    "./src/routes/*.js",
    "./src/modules/*/*.routes.js",
    "./src/modules/*/*.schema.js",
  ],
};

const swaggerSpec = swaggerJsdoc(options);

if (Object.keys(swaggerSpec.paths || {}).length === 0) {
  logger.warn("Swagger: no paths documented yet. Add @swagger JSDoc to your route files.");
}

export default swaggerSpec;
