const z = require("zod");

const scanQrSchema = z.object({
  token: z.string().min(1),
  deviceInfo: z.string().optional(),
});

module.exports = { scanQrSchema };
