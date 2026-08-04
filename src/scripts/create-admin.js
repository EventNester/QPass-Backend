import "dotenv/config";
import readline from "readline";
import { pathToFileURL } from "url";
import bcrypt from "bcryptjs";
import prisma from "../database/index.js";
import { constants } from "../config/index.js";

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput({ name, email, password }) {
  if (!name || !String(name).trim()) return "Name is required";
  if (!email || !EMAIL_RE.test(email)) return "Invalid email address";
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/\d/.test(password)) return "Password must contain a number";
  return null;
}

/**
 * Bootstrap the very first ADMIN account. Safe to run in any environment
 * (including production) because it refuses to run when an ADMIN already
 * exists — every later admin must come through the invite/promote endpoints.
 *
 * @param {Object} input - { name, email, password }
 * @returns {Promise<Object>} The created/updated user record
 */
export async function bootstrapFirstAdmin({ name, email, password }) {
  const validationError = validateInput({ name, email, password });
  if (validationError) throw new Error(validationError);

  const normalizedEmail = email.trim().toLowerCase();

  const existingAdmin = await prisma.user.findFirst({
    where: { role: constants.ROLES.ADMIN, deletedAt: null },
  });
  if (existingAdmin) {
    throw new Error(
      "An admin account already exists. Use POST /api/v1/admin/invites or PATCH /api/v1/admin/users/{userId}/promote for additional admins."
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const data = {
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: constants.ROLES.ADMIN,
    status: "ACTIVE",
    emailVerifiedAt: new Date(),
  };

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { ...data, ...(existing.deletedAt ? { deletedAt: null } : {}) },
    });
  }

  return prisma.user.create({ data });
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function main() {
  let name = process.env.ADMIN_NAME;
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    if (!process.stdin.isTTY) {
      console.error(
        "Missing credentials. Provide ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD as environment variables."
      );
      process.exit(1);
    }
    if (!name) name = await prompt("Admin name: ");
    if (!email) email = await prompt("Admin email: ");
    if (!password) password = await prompt("Admin password: ");
  }

  try {
    const user = await bootstrapFirstAdmin({ name, email, password });
    const maskedEmail = user.email.replace(
      /^(.)(.*)(@.*)$/,
      (_, first, rest, domain) => `${first}${"*".repeat(rest.length)}${domain}`
    );
    console.log(`First admin created successfully: ${user.name} (${maskedEmail})`);
    process.exit(0);
  } catch (error) {
    console.error(`Failed to create admin: ${error.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
