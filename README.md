# QPass Backend

QR Code-Based Event Attendance & Ticket Verification System.

QPass lets event organizers create and manage events, register attendees (via public links or bulk file import), issue secure QR tickets, verify attendance with real-time staff scanning, and analyze everything from a live dashboard.

- **API docs:** [Full API Reference](./docs/QPASS_API_DOC.md) · Live Swagger UI at `/api-docs`
- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Database diagram:** [ERD (DBML)](./docs/ERD.dbml) - paste into [dbdiagram.io](https://dbdiagram.io)

## Features

- **Authentication & RBAC** - JWT access/refresh token rotation with Redis blacklist; roles `ATTENDEE`, `STAFF`, `ORGANIZER`, `ADMIN`; password reset via email; **Sign in with Google** (OAuth 2.0 authorization-code flow) that signs users up or in and redirects them to the frontend dashboard.
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

# Google OAuth (Sign in with Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
OAUTH_FRONTEND_REDIRECT_URL=http://localhost:3000/pages/dashboard.html

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
| Auth | 15 | register, login, refresh, logout, forgot/reset password, me, update profile, change password, request/verify email, sessions, Google OAuth (start + callback) |
| Events | 7 | CRUD + publish + cancel |
| Ticket Types | 4 | per-event CRUD |
| Tickets | 5 | event ticket list/export + individual ticket/PDF + my tickets (history) |
| Registrations | 2 | public event view + free registration (no auth) |
| Import | 4 | upload, list, batch detail, template |
| Staff | 3 | assign / list / remove |
| Checkins | 4 | scan, list, undo, statistics |
| Reports | 4 | dashboard + registrations/attendance exports + overview analytics |
| Admin | 1 | audit logs |
| **Total** | **50** | **42 paths** across 11 tags |

See [docs/QPASS_API_DOC.md](./docs/QPASS_API_DOC.md) for the full reference and [SWAGGER_UI_TESTING.md](./SWAGGER_UI_TESTING.md) for a manual test walkthrough.

### Google OAuth (Sign in with Google)

Server-side authorization-code flow — the frontend only needs a button/link pointing at the backend:

1. `GET /api/v1/auth/google` (optional `?role=ORGANIZER|STAFF`) → 302 to Google's consent screen.
2. Google redirects to `GET /api/v1/auth/google/callback?code=...&state=...`.
3. The backend exchanges the code, verifies the email, and **creates the account if new (sign-up)** or **matches the email to an existing one (sign-in)**. New accounts are created as `ATTENDEE` by default with their Google email pre-verified; the account is immediately usable (no password email required).
4. On success the browser is redirected to `OAUTH_FRONTEND_REDIRECT_URL` (default: `FRONTEND_URL/pages/dashboard.html`) with the QPass tokens delivered in the URL **fragment** (never the query string, so tokens do not leak to server logs or the referrer):

   ```
   http://localhost:3000/pages/dashboard.html#access_token=...&refresh_token=...&mode=login
   ```

   `mode` is `signup` for new accounts and `login` for returning ones. On failure it redirects back with `error` and `error_description` query params instead.

**Frontend integration:** after the redirect, read the params with `new URLSearchParams(window.location.hash.slice(1))`, store `access_token`/`refresh_token` (e.g. in `localStorage`), strip them from the URL with `history.replaceState`, and call `GET /api/v1/auth/me` with `Authorization: Bearer <access_token>` for the full profile.

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
│   ├── tickets/            # ticket types, event tickets, individual tickets, my tickets, QR + PDF services
│   ├── registrations/      # public registration, attendee import (CSV/XLSX/PDF/DOCX)
│   ├── checkins/           # QR scan with duplicate detection, list, undo, statistics
│   ├── staff/              # staff assignment management
│   ├── notifications/      # Brevo email service, notification records, templates
│   ├── reports/            # dashboard stats, CSV/PDF exports, overview analytics, PDF generation
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

### Production Google OAuth values

In production the OAuth URLs must point at the deployed hosts, not `localhost`. Register these exact URLs as the **Authorized redirect URI** in Google Cloud Console, and set the matching environment variables:

```env
# Backend (deployed) callback — must match the Google Cloud Console redirect URI exactly
GOOGLE_CALLBACK_URL=https://api.yourdomain.com/api/v1/auth/google/callback
# Frontend page that receives the access/refresh tokens (in the URL fragment)
OAUTH_FRONTEND_REDIRECT_URL=https://app.yourdomain.com/pages/dashboard.html
# Frontend origin for the password-reset link and default redirect
FRONTEND_URL=https://app.yourdomain.com
```

> Production uses HTTPS, so the OAuth binding cookie is sent with the `Secure` flag (forced automatically when `NODE_ENV=production`). Local development uses `http://localhost` and a non-`Secure` cookie, so you can still test on plain HTTP. Keep the local (`http://localhost:3000/...`) and production (`https://...`) values clearly separate — never run the production frontend URL against a local backend.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

ISC
