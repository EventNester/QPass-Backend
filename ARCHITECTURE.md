# QPass Backend Architecture

This document describes how the QPass backend is built and how its parts fit together.

- **Runtime:** Node.js 22 (ES Modules) + Express 5
- **Database:** PostgreSQL 15 via Prisma 6 ORM
- **Cache / locks / sessions:** Redis 7
- **Real-time:** Socket.IO 4 with a Redis adapter
- **Email:** Brevo REST API
- **Docs:** Swagger (OpenAPI 3) served at `/api-docs`

---

## 1. High-Level Overview

```
                          ┌─────────────────────────────┐
                          │         Clients             │
                          │  Organizer / Attendee /     │
                          │  Staff (REST + Socket.IO)   │
                          └──────────────┬──────────────┘
                                         │ HTTPS / WSS
                    ┌────────────────────▼────────────────────┐
                    │              Express 5 App               │
                    │  Helmet - CORS - Rate-limit - JSON -     │
                    │  pino-http logging - 404 / error handler │
                    └────────────────────┬────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                    ┌───────────▼───────────┐                     │
        │                    │  /api/v1 (v1.js)      │                     │
        │                    │  /health /api-docs     │                     │
        │                    └───────────┬───────────┘                     │
        │          Router dispatch (mergeParams per resource)              │
        │                                │                                 │
        │   ┌──────────────┬─────────────┼───────────────┬──────────────┐  │
        │   │              │             │               │              │  │
        │   ▼              ▼             ▼               ▼              ▼  │
        │ Auth          Events        Tickets        Registrations   ...  │
        │ checkins     staff         reports         admin               │
        │   │              │             │               │              │  │
        │   └──────────────┴─────┬───────┴───────────────┴──────────────┘  │
        │                    Services (business logic)                     │
        └─────────────────────────┬────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼──────────────────────────┐
            ▼                     ▼                          ▼
      ┌───────────┐        ┌───────────┐             ┌────────────┐
      │PostgreSQL │        │   Redis   │             │ Socket.IO  │
      │  (Prisma) │        │locks/sess.│             │   rooms    │
      └───────────┘        └───────────┘             └────────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Brevo (REST) │  transactional email
                                   └──────────────┘
```

## 2. Request Lifecycle

1. Every request passes through `src/app.js`: `helmet` (security headers), `cors`, the global rate limiter (100 req / 15 min), `pino-http` request logging, and `express.json()`.
2. The root router (`src/routes/index.js`) mounts `/health`, `/api/v1`, and `/api-docs`.
3. `src/routes/v1.js` mounts each domain router. Path params such as `eventId` are shared across routers via `mergeParams`.
4. Route handlers run a middleware chain (see below), then call a **controller**, which delegates to a **service**, which returns data. Controllers wrap responses with `success()` / `created()` helpers.
5. Errors bubble up to the global error handler in `app.js`, which maps `AppError` subclasses and Zod validation failures to the correct HTTP status and a generic message.

### Middleware chain

```
validate(body/params/query via Zod) -> requireAuth (JWT) -> requireRole(...) -> controller
```

Not every route uses every step; public routes (`/e/:slug`, `/registrations/free`, `/auth/login`) skip auth. Role-restricted routes add `requireRole`. Ownership is enforced inside services (an `ADMIN` always bypasses ownership checks).

## 3. Module Layout

Each domain module follows a fixed convention:

```
src/modules/<module>/
├── <module>.controller.js   # HTTP concerns: parse req, call service, format response
├── <module>.service.js      # business logic, Prisma/Redis/external calls, throws AppError
├── <module>.routes.js       # Express Router with OpenAPI JSDoc annotations
└── <module>.schema.js       # Zod schemas for body, params, query
```

| Module | Responsibility |
|--------|----------------|
| `auth` | register, login, refresh, logout, JWT middleware, password reset (Redis-backed tokens) |
| `events` | event CRUD, publish (slug generation), cancel; ownership enforcement |
| `tickets` | ticket types, per-event ticket list/export, individual ticket view + PDF, QR generation |
| `registrations` | public event view (`GET /e/:slug`), free registration, bulk file import (CSV/XLSX/PDF/DOCX) |
| `checkins` | QR scan with duplicate detection, check-in list, undo (soft delete + audit) |
| `staff` | assign / list / remove staff, auto-create pending staff users |
| `notifications` | Brevo email service, `Notification` records, EJS templates |
| `reports` | dashboard statistics, CSV/PDF exports (registrations + attendance) |
| `admin` | audit log queries (ADMIN only) |

Supporting layers:

- `src/middlewares/` - `validate`, `rbac` (`requireAuth`, `requireRole`), `rate-limit`, `logging`, `upload` (Multer for imports)
- `src/realtime/` - Socket.IO bootstrap, room helpers, event emitters
- `src/integrations/` - external service clients (Brevo REST)
- `src/utils/` - error classes, response helpers, JWT, crypto (SHA-256 hashing), slug generation, file parsers
- `src/config/` - environment validation, constants, system messages, logger, Redis client, Swagger spec

## 4. Data Layer

- **Prisma** is the single source of truth for the schema (`src/database/schema.prisma`). Columns map to `snake_case` via `@map`; application code uses `camelCase`.
- Primary keys are UUIDs generated with `gen_random_uuid()`. Soft deletes use a nullable `deletedAt` on `User`, `Event`, and `CheckIn`.
- Key constraints that guard invariants:
  - `Registration` is unique on `[eventId, attendeeEmail]` and links 1:1 to a `TicketCode`.
  - `CheckIn` is unique on `[eventId, registrationId]` (duplicate scan protection at the DB level).
  - `QrToken` stores only `tokenHash` (SHA-256) - the raw token is never persisted.
  - `EventStaffAssignment` is unique on `[eventId, userId]`.
- **Redis** is used for: refresh-token blacklist, password-reset tokens (15 min TTL), and a distributed lock (`SETNX lock:checkin:{eventId}:{tokenHash}`, 10 s TTL) during QR scans.

See [docs/ERD.dbml](./docs/ERD.dbml) for the full entity-relationship model (paste it into dbdiagram.io to render).

## 5. Authentication & Authorization

1. **Register** - bcrypt-hashed password; role defaults to `ATTENDEE`; optional `role` of `ATTENDEE` / `ORGANIZER` / `STAFF`; `ADMIN` is never self-assignable.
2. **Tokens** - `jsonwebtoken` issues a 30-minute access token and a 7-day refresh token. Refresh rotation: the old refresh token is blacklisted in Redis before a new pair is issued.
3. **Requests** - `requireAuth` verifies the bearer access token and attaches `req.user` (`id`, `email`, `role`, `name`).
4. **RBAC** - `requireRole("ORGANIZER", "ADMIN", ...)` gates routes; ownership checks in services scope data to the caller; `ADMIN` bypasses ownership.
5. **Password reset** - `forgot-password` writes a hashed reset token to Redis (15 min TTL) and emails the attendee. The token is deleted on use or send failure, and generic responses prevent account enumeration.

## 6. QR Tickets & Check-in

### Issue
- Each registration gets a 64-char hex token (`crypto.randomBytes(32)`).
- Only `SHA-256(tokenHash)` is stored; the raw token is delivered to the attendee (email / web / PDF).
- A `QrToken` row stores `expiresAt = event.endTime + 24h`, `revokedAt`, and `scanCount`.

### Verify (scan)
1. Caller must be an active assigned staff member or the event owner, otherwise `NOT_AUTHORIZED`.
2. Acquire the Redis lock for the token hash; a held lock returns `409`.
3. Hash the scanned token and look it up. Map failures to result states: not found `INVALID`, expired `EXPIRED`, wrong event `WRONG_EVENT`, revoked `REVOKED`.
4. Re-check the `CheckIn` unique constraint; an existing row yields `DUPLICATE`.
5. On success create the `CheckIn`, bump `scanCount`, set `revokedAt`, write an audit log, and emit `checkin:update` to the dashboard room.

### Undo
- Soft-deletes the `CheckIn`, restores the registration to `CONFIRMED`, re-enables the QR token, and writes an audit entry with a before-snapshot. Limited to the last 24 hours and to the event owner or the original scanning staff.

## 7. Real-time (Socket.IO)

- The server attaches Socket.IO to the HTTP server with a Redis adapter (falls back to in-memory if Redis is unreachable).
- Clients authenticate by passing a JWT in `socket.handshake.auth.token`; rooms reject unauthorized joins.

| Room | Event | Payload intent |
|------|-------|----------------|
| `event:{eventId}:dashboard` | `checkin:update` | scan result + timestamp, total checked in |
| `event:{eventId}:dashboard` | `registration:new` | new registration + timestamp |
| `event:{eventId}:scan` | `scan:result` | per-scan feedback to the staff device |

## 8. Email (Brevo REST)

- All email goes through the Brevo transactional REST API (no SMTP), so it works on hosts where SMTP ports are blocked.
- Flow: create a `Notification` (PENDING) -> render an EJS template -> send with retry (up to 3 attempts for transient errors only) -> mark SENT/FAILED with `providerMessageId` / `failureReason`.
- Sends are **non-blocking**: a failure never breaks the core action (registration, check-in, staff assignment, password reset).
- If `BREVO_API_KEY` is unset, sends are skipped with a warning. When set, env validation requires a non-blank sender name and a valid sender email.

## 9. Security

| Area | Implementation |
|------|----------------|
| Headers | `helmet` (with CORS relaxed for the configured origin) |
| Rate limiting | global 100 req / 15 min; auth endpoints 5 req / 15 min |
| Input validation | Zod on body, params, and query for every endpoint |
| Secrets | only in environment, validated at startup (`src/config/env.js`) |
| PII | opaque QR tokens carry no personal data; public event payloads omit `ownerId` |
| Error responses | generic client-facing messages; server logs carry details |
| File uploads | Multer: 5 MB max, `.csv/.xlsx/.pdf/.docx` only |
| Queries | Prisma parameterized queries |
| Audit | every key action logged to `AuditLog` with actor, entity, and before/after snapshots |

## 10. Configuration & Observability

- **Config** - `src/config/env.js` validates `process.env` with Zod on boot and exits with field errors if invalid. The `superRefine` rule ties Brevo sender fields to `BREVO_API_KEY`.
- **Logging** - Pino structured JSON logs (`pino-http` for requests). `LOG_LEVEL` controls verbosity.
- **Health** - `GET /health` pings Postgres and Redis and returns `200` / `503`.
- **Graceful shutdown** - on SIGTERM/SIGINT the server closes the HTTP listener, Socket.IO, the Prisma client, and Redis, with a 10 s hard-exit guard.

## 11. Testing

- **Unit tests** live next to source (`src/modules/**/tests/`, `src/utils/tests/`, `src/middlewares/tests/`, `src/realtime/tests/`).
- **Integration tests** live in `src/tests/integration/` and run against Dockerized Postgres (host port 5433) and Redis (host port 6380).
- Runner: Vitest (serial execution), Supertest for HTTP assertions. Full suite: 35 files / ~585 tests.
- `npm run test:unit` scopes to unit tests; `npm run test:run` runs everything; `npm run lint` runs ESLint.

## 12. Deployment

- `Dockerfile` is a multi-stage build (builder + production image). `docker-compose.yml` runs Postgres 15 and Redis 7 locally.
- `railway.json` enables deployment to Railway.
- Post-deploy verification: `GET /health` -> 200, `/api-docs` renders, register -> login -> create/publish event -> scan flow works.

---

*Architecture.md - keep in sync with `src/` when modules or patterns change.*
