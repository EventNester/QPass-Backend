# Contributing to EventNester Backend

Thank you for contributing! This guide covers setup, conventions, and the PR workflow.

## Getting Started

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/EventNester-backend.git
cd EventNester-backend
git remote add upstream https://github.com/EventNester/EventNester-backend.git
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
7. **Address review feedback** — push additional commits to the same branch
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

The project uses ES Modules (`"type": "module"` in `package.json`). Use `import`/`export` — never `require`/`module.exports`.

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

- Never commit `.env` files — they are gitignored
- When adding a new env var, update both `.env.example` and `README.md`
- Use placeholder values in `.env.example`, not real secrets

## Code Review

When reviewing PRs:

- Check for security issues (exposed secrets, missing auth)
- Verify error handling covers edge cases
- Ensure new endpoints have validation schemas
- Confirm database queries are efficient (check for missing indexes)
- Run tests locally if the change is complex

## Questions?

Open a GitHub issue or reach out in the team channel.
