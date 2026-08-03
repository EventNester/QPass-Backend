# QPass Backend

QR Code-Based Event Attendance & Ticket Verification System.

QPass lets event organizers create and manage events, register attendees (via public links or bulk file import), issue secure QR tickets, verify attendance with real-time staff scanning, and analyze everything from a live dashboard.

- **API docs:** [Full API Reference](./docs/QPASS_API_DOC.md) · [Swagger UI Testing Guide](./SWAGGER_UI_TESTING.md) · Live Swagger UI at `/api-docs`
- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Database diagram:** [ERD (DBML)](./docs/ERD.dbml) - paste into [dbdiagram.io](https://dbdiagram.io)

## Features

- **Authentication & RBAC** - JWT access/refresh token rotation with Redis blacklist; roles `ATTENDEE`, `STAFF`, `ORGANIZER`, `ADMIN`; password reset via email.
- **Events** - full CRUD with `DRAFT → PUBLISHED → ACTIVE → COMPLETED / CANCELLED` lifecycle and slug-based public URLs.
- **Ticket types** - per-event categories (price in the smallest currency unit, optional capacity, ordering).
- **Registration flows** - public self-registration (`GET /e/{slug}` + `POST /registrations/free`) and bulk import (CSV / XLSX / PDF / DOCX, 5 MB max) with per-row validation and batch tracking.
- **QR tickets** - opaque 64-char random tokens, SHA-256 hashed server-side (raw token never stored), embedded in emails and downloadable PDF tickets.
- **Check-in** - staff/organizer scanning with 7 result states (`VALID`, `DUPLICATE`, `INVALID`, `EXPIRED`, `WRONG_EVENT`, `REVOKED`, `NOT_AUTHORIZED`), Redis distributed locking + Postgres unique constraint to block duplicates, and 24-hour undo.
- **Staff management** - assign/remove staff per event (auto-creates pending staff accounts + invite email).
- **Reports** - event dashboard stats and CSV/PDF exports for registrations and attendance.
- **Admin** - paginated, filterable audit log of every key action.
- **Real-time** - Socket.IO live dashboard & scan-feedback rooms backed by a Redis adapter.
- **Email** - Brevo REST API (no SMTP), non-blocking, with retry logic and a `Notification` audit record per send.
- **Ops** - Zod-validated environment config, structured Pino logging, Helmet + CORS + rate limiting, health checks, graceful shutdown, Swagger auto-docs, Vitest unit + integration suites.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime / Framework | Node.js 22 LTS, Express 5 (ES Modules) |
| Database / ORM | PostgreSQL 15, Prisma 6 |
| Cache / Locking | Redis 7 (`ioredis` + `redis` clients) |
| Real-time | Socket.IO 4 with `@socket.io/redis-adapter` |
| Validation | Zod 3 |
| Auth | `jsonwebtoken` (30m access / 7d refresh) + `bcryptjs` |
| Email | Brevo REST API (`axios`) |
| QR / PDF | `qrcode`, `pdfkit` |
| File parsing | `csv-parse`, `xlsx`, `pdf-parse`, `mammoth` |
| Uploads | `multer` (5 MB, `.csv/.xlsx/.pdf/.docx`) |
| Logging | Pino + `pino-http` |
| Security | `helmet`, `express-rate-limit` |
| Testing | Vitest 4 + Supertest 7 |
| Docs | `swagger-jsdoc` + `swagger-ui-express` |

> **Paystack** keys are accepted in the environment and `Payment`/`Invoice` models exist in the schema, but payment endpoints are not yet exposed (future phase).

## Prerequisites

- Node.js 22+
- Docker & Docker Compose (for Postgres + Redis)

## Quick Start

```bash
git clone https://github.com/EventNester/QPass-Backend.git
cd QPass-Backend
npm install
cp .env.example .env    # edit with your config
docker compose up -d    # starts Postgres (5433) + Redis (6380)
npm run migrate         # run database migrations
npm run dev             # start dev server at http://localhost:3000
```

> `npm install` automatically runs `prisma generate` via the `prepare` script.

Verify it's up:

```bash
curl http://localhost:3000/health
# { "status": "healthy", "checks": { "database": "ok", "redis": "ok" }, ... }
```

Swagger UI: <http://localhost:3000/api-docs>

## Environment Variables

All variables are validated on startup by a Zod schema (`src/config/env.js`) - the process exits with a clear error if required values are missing or invalid.

```env
# Core
NODE_ENV=development              # development | production | test
PORT=3000
LOG_LEVEL=info

# HTTP / Docs
CORS_ORIGIN=http://localhost:3000
SWAGGER_ENABLED=true              # true | false

# Database (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/qpass?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=
REDIS_DATABASE=0

# JWT
JWT_SECRET=your_secret_key_min_32_bytes_long_here
JWT_EXPIRES_IN=30m
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_bytes
JWT_REFRESH_EXPIRES_IN=7d

# Paystack (prepared, not yet used by endpoints)
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=

# Frontend URL (used in password reset link)
FRONTEND_URL=http://localhost:3000

# Email (Brevo REST API)
BREVO_API_KEY=
BREVO_SENDER_EMAIL=you@example.com
BREVO_SENDER_NAME=your_sender_name_here

# Socket.IO
SOCKET_CORS_ORIGIN=http://localhost:3000

# Optional
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
UPLOAD_DIR=uploads
```

> **Brevo validation:** when `BREVO_API_KEY` is set, `BREVO_SENDER_NAME` must be non-blank and `BREVO_SENDER_EMAIL` must be a valid email - otherwise startup fails. If no API key is set, emails are skipped with a warning (non-blocking).

The default Docker Compose maps Postgres to host port `5433` and Redis to `6380`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload (`nodemon`) |
| `npm start` | Start production server |
| `npm run generate` | Generate the Prisma client |
| `npm run migrate` | Run/apply dev migrations |
| `npm run migrate:prod` | Deploy migrations (production) |
| `npm run migrate:reset` | Reset the database |
| `npm run seed` | Seed the database with sample data |
| `npm run studio` | Open Prisma Studio |
| `npm test` | Run tests (watch mode) |
| `npm run test:run` | Run all tests once |
| `npm run test:unit` | Run unit tests only (modules, utils, middlewares, realtime) |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run docs` | Regenerate the OpenAPI spec (`docs/swagger.yaml`) |

## API Overview

Base URL: `http://localhost:3000` · all endpoints under `/api/v1` (except `/health`, `/api-docs`).

| Tag | Operations | Notes |
|-----|:----------:|-------|
| Health | 1 | `GET /health` (public) |
| Auth | 6 | register, login, refresh, logout, forgot-password, reset-password |
| Events | 7 | CRUD + publish + cancel |
| Ticket Types | 4 | per-event CRUD |
| Tickets | 4 | event ticket list/export + individual ticket/PDF |
| Registrations | 2 | public event view + free registration (no auth) |
| Import | 4 | upload, list, batch detail, template |
| Staff | 3 | assign / list / remove |
| Checkins | 3 | scan, list, undo |
| Reports | 3 | dashboard + registrations/attendance exports |
| Admin | 1 | audit logs |
| **Total** | **38** | **31 paths** across 11 tags |

See [docs/QPASS_API_DOC.md](./docs/QPASS_API_DOC.md) for the full reference and [SWAGGER_UI_TESTING.md](./SWAGGER_UI_TESTING.md) for a manual test walkthrough.

## Project Structure

```
src/
├── app.js                  # Express app (helmet, CORS, rate-limit, JSON, error handler)
├── server.js               # HTTP server, Socket.IO, DB/Redis bootstrap, graceful shutdown
├── config/                 # env validation, constants, system messages, logger, redis, swagger
├── database/               # Prisma schema, client, seed, migrations
├── middlewares/            # logging, rate-limit, RBAC, upload (multer), Zod validate
├── modules/                # Domain modules (controller → service → routes → schema)
│   ├── auth/               # register/login/refresh/logout, JWT middleware, password reset
│   ├── events/             # event CRUD, publish, cancel
│   ├── tickets/            # ticket types, event tickets, individual tickets, QR + PDF services
│   ├── registrations/      # public registration, attendee import (CSV/XLSX/PDF/DOCX)
│   ├── checkins/           # QR scan with duplicate detection, list, undo
│   ├── staff/              # staff assignment management
│   ├── notifications/      # Brevo email service, notification records, templates
│   ├── reports/            # dashboard stats, CSV/PDF exports, PDF generation
│   └── admin/              # audit log queries
├── integrations/           # external services (email/Brevo)
├── realtime/               # Socket.IO init, rooms, event emitters
├── routes/                 # root router (/health, /api/v1, /api-docs)
├── tests/                  # integration tests + helpers
└── utils/                  # crypto, email, error classes, JWT, response helpers, slug, parsers
```

## Database

The Prisma schema lives at `src/database/schema.prisma` (13 models, 11 enums). All Prisma commands use `--schema=./src/database/schema.prisma`.

```bash
npm run generate       # generate Prisma client
npm run migrate        # create/apply a dev migration
npm run migrate:prod   # deploy migrations (production)
npm run migrate:reset  # reset database
npm run seed           # seed sample data
npm run studio         # open Prisma Studio
```

**ERD:** paste [`docs/ERD.dbml`](./docs/ERD.dbml) into [dbdiagram.io](https://dbdiagram.io) to render the entity-relationship diagram.

## Real-time Events

Socket.IO is attached to the HTTP server and uses a Redis adapter (falls back to in-memory). Clients authenticate by passing a JWT via `socket.handshake.auth.token`.

| Room | Events |
|------|--------|
| `event:{eventId}:dashboard` | `checkin:update`, `registration:new` |
| `event:{eventId}:scan` | `scan:result` |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details on the real-time layer.

## Docker

```bash
docker compose up -d              # start services
docker compose up --build -d      # rebuild and start
docker compose down               # stop services
docker compose down -v            # stop and remove volumes
```

## Testing

```bash
npm test               # watch mode
npm run test:run       # single run (35 files, ~585 tests)
npm run test:unit      # unit tests only
npm run test:coverage  # with coverage
npm run lint           # ESLint
```

Tests live alongside source files (`src/modules/**/tests/`, `src/utils/tests/`) and in `src/tests/integration/`. Integration tests run against Dockerized Postgres (`5433`) and Redis (`6380`).

## Deployment

`railway.json` and the multi-stage `Dockerfile` are included for deployment on Railway (or any container host).

1. Set production environment variables (same set as above).
2. Run `npm run migrate:prod`.
3. Start with `npm start` (or `docker compose` / Railway).

Post-deploy checks: `GET /health` → 200 · `/api-docs` loads · register → login → create event → publish.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

ISC
