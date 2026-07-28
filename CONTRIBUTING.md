# Contributing to QPass Backend
Thank you for contributing! This guide covers setup, conventions, and the PR workflow.

## Getting Started

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/QPass-Backend.git
cd QPass-Backend
git remote add upstream https://github.com/EventNester/QPass-Backend.git
```

### 2. Install dependencies

```bash
npm install
```

This automatically generates the Prisma client via the `prepare` script.

### 3. Start services

```bash
cp .env.example .env
docker compose up -d
npm run migrate
npm run dev
```

### 4. Run tests before pushing

```bash
npm run lint
npm run test:run
```

## Branch Strategy

We use a **feature branch** workflow. The `dev` branch is the default integration branch.

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `dev` | Integration branch — PRs merge here first |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Maintenance, config, docs |

### Branch naming

```
feat/add-email-notifications
fix/checkin-duplicate-detection
chore/update-ci-pipeline
```

### Creating a branch

```bash
git checkout dev
git pull upstream dev
git checkout -b feat/your-feature-name
```

## Pull Request Workflow
1. **Create your branch** from `dev`
2. **Make your changes** in small, focused commits
3. **Run lint and tests** locally before pushing
4. **Push** and open a PR against `dev`
5. **Fill out the PR description** — what changed, why, and how to test
6. **Request a review** from at least one team member
7. **Address review feedback**, push additional commits to the same branch
8. **Merge** once approved and CI passes

### PR title format
Use conventional commits:

```
feat: add registration email flow
fix: resolve duplicate check-in race condition
chore: update Prisma schema docs
```

## Code Conventions

### Module structure

Every domain module follows the same pattern:

```
src/modules/<module>/
├── <module>.controller.js   # Request handling
├── <module>.service.js      # Business logic
├── <module>.routes.js       # Route definitions
└── <module>.schema.js       # Zod validation schemas
```

### ES Modules
The project uses ES Modules (`"type": "module"` in `package.json`). Use `import`/`export`; never `require`/`module.exports`.

```js
// Good
import { getConfig } from "../config/index.js";
export async function handler(req, res) { ... }

// Bad
const { getConfig } = require("../config/index.js");
module.exports = { handler };
```

### Path extensions
Always use `.js` extensions in relative imports:

```js
import prisma from "../database/index.js";  // correct
import prisma from "../database/index";     // wrong
```

### Imports from config
Use the barrel export from `config/index.js`:

```js
import { getConfig, logger, systemMessages } from "../config/index.js";
```

### Comments
Place a short comment **above** any non-obvious code to explain *why* it exists or *what* it achieves. Aim for the "hard-to-understand areas" bar, straightforward getters, simple assignments, and self-explanatory one-liners don't need them.

```js
// Ensure the uploads directory exists at app startup. `recursive: true` avoids
// errors if the directory is already present.
const uploadDir = join(process.cwd(), constants.UPLOAD.DIR);
mkdirSync(uploadDir, { recursive: true });

// Set for O(1) extension lookups during file filtering.
const ALLOWED_EXT = new Set(constants.UPLOAD.ALLOWED_EXTENSIONS);
```

Keep comments to **1–3 lines**. Prefer explaining the *intent* over restating what the code does:

```js
// Good — explains intent
// Swallow unlink errors to avoid masking the original upload failure.
await unlink(filePath).catch(() => {});

// Bad — just restates the code
// Unlink the file and ignore errors
await unlink(filePath).catch(() => {});
```

For classes and public methods, use **JSDoc** blocks with `@param`/`@returns`/`@throws`:

```js
/**
 * Validate a scanned QR token string.
 *
 * 1. Hash the raw token with SHA-256.
 * 2. Look up the QrToken record by hash.
 * 3. Check expiration and revocation.
 *
 * @param {string} token - The raw token string scanned from the QR code
 * @returns {Promise<Object>} The QrToken record with its registration
 * @throws {NotFoundError} If the token hash is not found
 */
async validateToken(token) { ... }
```

### Controller / Service separation
Controllers handle HTTP concerns (request parsing, response formatting, error delegation). **Services must never touch `req` or `res`**; they contain pure business logic and throw `AppError` subclasses. Controllers call `next(err)` to forward errors to the global handler.

```js
// controller — thin, delegates to service
export async function createEvent(req, res, next) {
  try {
    const event = await eventService.create(req.user.id, req.body);
    res.status(201).json(success(event, "Event created"));
  } catch (err) {
    next(err);
  }
}

// service — no req/res, throws on failure
async function create(ownerId, data) {
  if (!ownerId) throw new NotFoundError("User not found");
  return prisma.event.create({ data: { ...data, ownerId } });
}
```

### Route middleware chain
Every protected route must apply middleware in this order:

```
validate(schema) → requireAuth → requireRole("ROLE") → controller
```

```js
router.post(
  "/events",
  validate(createEventSchema),
  requireAuth,
  requireRole("ORGANIZER"),
  eventController.createEvent
);
```

### Response helpers
Use the `success()` and `created()` helpers from `utils/response.js`, never construct raw response objects by hand:

```js
import { success, created } from "../utils/response.js";

res.json(success(data, "Events retrieved"));
res.status(201).json(created(data, "Event created"));
```

### Database conventions
- Columns use `snake_case` in the schema via `@map`; application code uses `camelCase`.
- Use soft deletes (`deletedAt`) where specified — never `DELETE FROM`.
- Add indexes for columns that appear in `where` clauses, foreign keys, and unique constraints.

```prisma
model Event {
  id        String   @id @default(uuid()) @db.Uuid
  title     String
  slug      String   @unique
  ownerId   String   @db.Uuid
  owner     User     @relation(fields: [ownerId], references: [id])
  deletedAt DateTime?

  @@index([ownerId])
  @@index([status])
  @@map("events")
}
```

### Audit logging
Log all key actions (event CRUD, registration, QR issue, scan, payment, staff actions) via the `AuditLog` model. Include actor, entity, entity ID, and before/after snapshots where relevant. Webhook-triggered actions set `actorId` to `null`.

### Non-blocking side effects
Emails, notifications, and Socket.IO emissions must never block the core response. Use fire-and-forget patterns:

```js
// Good — email failure does not prevent registration
notificationService.send(registration.id).catch(() => {});

// Bad — blocks the response, email failure breaks the flow
await notificationService.send(registration.id);
```

### Security
- **Never hardcode secrets**, use environment variables via `config/env.js`.
- **Never trust client-supplied amounts** (especially payments). Always pull the authoritative value server-side (e.g. `TicketType.price`).
- **RBAC is server-side only.** Roles are stripped from user input at registration; never accept a `role` field from the client.
- **PII stays out of QR payloads.** QR tokens are opaque random strings, no names, emails, or event data encoded.
- **Webhook verification** - Paystack webhooks must be verified with HMAC-SHA512 before processing. Never skip signature checks.
- **File uploads** - validate extension and size at the middleware layer. Reject anything outside the allowed set.
- **Helmet is mandatory.** Do not disable security headers in production.
- **Prisma queries are parameterized** by default, never interpolate raw values into `$queryRaw` unless absolutely necessary.
- **Generic error messages to clients.** Never leak stack traces, SQL errors, or internal file paths in responses.

### Error handling
Use custom error classes from `utils/error.js`:

```js
import { NotFoundError, ConflictError } from "../utils/error.js";

throw new NotFoundError("Event not found");
throw new ConflictError("Duplicate check-in detected");
```

### Response messages
Never hardcode response messages. Always use `system_messages.js`:

```js
import { systemMessages } from "../config/index.js";

res.json({ message: systemMessages.SUCCESS.EVENT.CREATED });
```

### Prisma schema
The schema lives at `src/database/schema.prisma`. Always pass the `--schema` flag:

```bash
npx prisma generate --schema=./src/database/schema.prisma
npx prisma migrate dev --schema=./src/database/schema.prisma
```

### Validation
Define Zod schemas in `<module>.schema.js` and apply via the `validate` middleware:

```js
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});
```

## Testing
- Tests live alongside source files or in a `__tests__` directory
- Use **Vitest** as the test runner and **Supertest** for HTTP assertions
- Run `npm run test:run` before pushing
- Aim for tests on all new service and controller logic

```bash
# Watch mode
npm test

# Single run
npm run test:run

# With coverage
npm run test:coverage
```

## Commits
Write clear, concise commit messages:

```
feat: add QR code generation for event tickets
fix: prevent duplicate check-ins for same registration
refactor: extract Paystack client into integrations/
docs: update API endpoint table in README
```

## Environment Variables
- Never commit `.env` files, they are gitignored
- When adding a new env var, update both `.env.example` and `README.md`
- Use placeholder values in `.env.example`, not real secrets

## Code Review
When reviewing PRs:

- Check for security issues (exposed secrets, missing auth)
- Verify error handling covers edge cases
- Ensure new endpoints have validation schemas
- Confirm database queries are efficient (check for missing indexes)
- Verify the route middleware chain: `validate → requireAuth → requireRole → controller`
- Ensure services do not touch `req` or `res`
- Check that response messages come from `system_messages.js`, not hardcoded strings
- Confirm emails/notifications are non-blocking (fire-and-forget)
- Run tests locally if the change is complex

## Questions?
Open a GitHub issue or reach out in the team channel.
