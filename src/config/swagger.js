import swaggerJsdoc from "swagger-jsdoc";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFINITION_PATH = join(__dirname, "../../docs/swagger-definition.json");

if (!existsSync(DEFINITION_PATH)) {
  logger.warn(`Swagger definition not found at ${DEFINITION_PATH}. Docs will be empty.`);
}

const definition = existsSync(DEFINITION_PATH)
  ? JSON.parse(readFileSync(DEFINITION_PATH, "utf-8"))
  : { openapi: "3.0.0", info: { title: "API", version: "0.0.0" } };

const options = {
  definition,
  apis: ["./src/routes/*.js", "./src/modules/*/*.routes.js"],
};

export default swaggerJsdoc(options);
