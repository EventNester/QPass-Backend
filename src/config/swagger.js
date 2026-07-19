import swaggerJsdoc from "swagger-jsdoc";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const definition = JSON.parse(readFileSync(join(__dirname, "../../docs/swagger-definition.json"), "utf-8"));

const options = {
  definition,
  apis: ["./src/routes/*.js", "./src/modules/*/*.routes.js"],
};

export default swaggerJsdoc(options);
