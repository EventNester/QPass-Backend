const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "EventNester API",
      version: "1.0.0",
      description:
        "QR Code-Based Event Attendance & Ticket Verification System API",
      contact: {
        name: "EventNester Team",
        email: "support@eventnester.com",
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === "production"
          ? "https://api.eventnester.com"
          : "http://localhost:3000",
        description:
          process.env.NODE_ENV === "production"
            ? "Production server"
            : "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/*.js", "./src/modules/*/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
