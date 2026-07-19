import { PrismaClient } from "@prisma/client";

let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({ log: ["error", "warn"] });
} else {
  if (!globalThis.prisma) {
    globalThis.prisma = new PrismaClient({ log: ["query", "error", "warn"] });
  }
  prisma = globalThis.prisma;
}

export default prisma;
