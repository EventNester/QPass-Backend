# QPass Backend Technical Requirements Document

| Field | Value |
|-------|-------|
| **Product** | QPass QR Code-Based Event Attendance & Ticketing System |
| **Stack** | Node.js 22, Express 5, Prisma ORM, PostgreSQL, Redis, Socket.IO, Zod, Vitest, Brevo REST API |
| **Timebox** | 2-week MVP |
| **Date** | July 2026 |
| **Authors** | Crosstrack Group 13 |
---

> **Status:** This TRD reflects the finished, as-built backend. For the live source of truth see [README](../README.md) (quick start), [Architecture](../ARCHITECTURE.md) (system design), [ERD](./ERD.dbml) (data model), and [API documentation](./QPASS_API_DOC.md) (current endpoints).## 1. Executive Summary

QPass is an event registration, ticketing, and attendance intelligence platform that enables event organizers to create, manage, verify, and analyze events from a single platform. The backend uses Node.js 22, Express 5, Prisma ORM with PostgreSQL, Redis for distributed locking, Socket.IO for real-time updates.

> **Core flow:** Organizer creates event → attendees import or self-register → unique QR credential issued → staff scan QR on event day → duplicate blocked → organizers see/export attendance data.

**MVP ships:** Auth (RBAC: Organizer, Staff, Attendee, Admin), Event CRUD with slug-based public URLs, TicketType management, attendee import (CSV/XLSX/PDF/DOCX), public registration, QR code generation/scanning with duplicate detection, Brevo REST email delivery, staff management, dashboard statistics, CSV/PDF export, PDF ticket downloads, and audit logging.

**Deferred (Phase 2):** Payment processing (Paystack integration, paid registration, webhooks), full KYC, SMS (email OTP is shipped), offline scanning, rotating QR, ticket transfer/resale, refunds, promo codes, event marketplace, AI analytics, push notifications, multi-language support.

---

## 2. Project Overview

### 2.1 Problem Statement

The event industry in Nigeria suffers from fragmented attendance management. Organizers rely on printed lists, WhatsApp confirmations, and manual verification, leading to slow check-in (10-30 seconds per person), duplicate ticket fraud, lost paper records, and zero real-time visibility. QPass unifies registration, QR-based verification, attendance tracking, and analytics in one platform.

### 2.2 Product Vision

Become Africa's most trusted attendance verification & ticket management platform for events, institutions, churches, and organizations.

### 2.3 Target Users

| Persona | Role | Key Need |
|---------|------|----------|
| Akachukwu | Event Organizer | Fast QR verification, centralized dashboard, no fraud |
| Tolu | Attendee | Simple registration, digital ticket, fast entry |
| Ibrahim | Check-in Staff | Instant scan result, clear admit/reject |
| Grace | Platform Admin | User management, monitoring, security |

### 2.4 Success Metrics

| Metric | Target |
|--------|--------|
| Average check-in time | < 5 seconds per attendee |
| Duplicate entry blocked | 100% |
| Registration/attendance accuracy | > 99% |
| Dashboard update latency | < 3 seconds |
| Platform uptime during events | ≥ 99.5% |

---

## 3. MVP Scope

### 3.1 Ships in MVP

| Feature | Notes |
|---------|-------|
| Auth (register, login, refresh, password reset) | RBAC: Organizer, Staff, Attendee, Admin. JWT 30min access / 7d refresh. |
| Google OAuth (Sign in with Google) | OAuth 2.0 authorization-code flow for sign-up and sign-in. New accounts get a random unusable password + pre-verified email. Redirects to frontend dashboard with tokens. |
| Event CRUD + publish | Owner-only. Slug-based public URLs. DRAFT → PUBLISHED → ACTIVE → COMPLETED/CANCELLED. Publish and unpublish (PUBLISHED/ACTIVE → DRAFT, slug preserved). |
| TicketType management | Per-event categories (VIP, Regular, Student). Price in naira, optional capacity. |
| Attendee import (CSV/XLSX/PDF/DOCX) | Row validation, batch tracking, per-row error reporting. 5MB max. Synchronous (<1000 rows). |
| Public registration | Slug-based link. Instant confirmation + QR. |
| QR code generation | One per registration. SHA-256 hashed server-side. Raw token delivered to attendee. Expires event end + 24h. |
| Payment processing (Phase 2) | Paystack integration, paid registration, webhooks. Deferred from MVP. |
| Email (Brevo REST) | 4 templates: registration, QR, staff invite, password reset. Non-blocking. |
| QR check-in | Staff scan with duplicate detection (Redis distributed lock + DB unique constraint). Undo by owner or scanning staff within 24 hours. |
| Staff management | Assign/remove staff. Email invitation for new staff users. |
| Dashboard stats | Registrations, check-ins, no-shows, capacity utilization, ticket breakdown. Real-time via Socket.IO. |
| CSV export | Attendance and registration lists as downloadable CSV/PDF. |
| PDF ticket downloads | Server-generated PDF with event details, QR code, attendee info, confirmation code. |
| Audit logging | Event CRUD, registration, QR issue, scan, staff actions. |
| Health check + Swagger | `GET /health` with DB/Redis status. Auto-generated OpenAPI docs. |

### 3.2 Deferred (Post-MVP)

SMS (email OTP is shipped), offline scanning, rotating QR, ticket transfer/resale, refunds, promo codes, event branding, custom registration fields, marketplace, AI analytics, push notifications, multi-gate sync, seat allocation, white-label, public APIs.

---

## 4. System Architecture

### 4.1 High-Level Overview

```
Clients (Organizer Dashboard / Attendee Portal / Staff Scanner)
    → Express 5 (Helmet, CORS, Rate-limit, JSON, pino-http)
        → Router (/health, /api/v1/*, /api-docs)
            → Middleware (validate Zod → requireAuth → requireRole)
                    → Module Layer (auth, events, tickets, registrations, checkins, staff, notifications, reports, admin, pdf)
                    → Prisma/PostgreSQL | Redis | Integrations (Google OAuth, Brevo, Sentry) | Socket.IO
```

### 4.2 Module Convention

Every module under `src/modules/<module>/` follows:

```
<module>.controller.js   # Request handling, response formatting, error delegation
<module>.service.js      # Business logic, DB queries, external calls
<module>.routes.js       # Express Router, HTTP method + path mapping
<module>.schema.js       # Zod validation schemas
```

**Rules:** Controllers delegate to services; services never touch `req`/`res`. Services throw `AppError` subclasses; controllers call `next(err)`. Routes apply `validate(schema)` → `requireAuth` → `requireRole(...)` → controller. All responses use `success()`/`created()` helpers. All error messages from `system_messages.js` - never hardcoded. ESM `import/export` with `.js` extensions.

### 4.3 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime/Framework | Node.js 22 / Express 5 | HTTP server |
| ORM/DB | Prisma 6 / PostgreSQL 15 | Data store, migrations |
| Cache/Lock | Redis 7 (ioredis) | Distributed locks, caching |
| Real-time | Socket.IO 4 | Live dashboard updates |
| Validation | Zod 3 | Request/response schemas |
| Auth | jsonwebtoken + bcryptjs + Google OAuth 2.0 | JWT tokens, password hashing, Sign in with Google |
| PDF/QR | pdfkit 0.19 + qrcode 1.5 | Ticket PDF, QR images |
| File Parsing | csv-parse, xlsx, pdf-parse, mammoth | Import (CSV/XLSX/PDF/DOCX) |
| HTTP Client | axios 1.x | External API calls |
| Email | Brevo REST API (axios) | Transactional email |
| Logging | pino + pino-http | Structured JSON logging |
| Security | helmet 8 + express-rate-limit 7 | Headers, rate limiting |
| Testing | Vitest 4 + Supertest 7 | Unit + integration tests |
| Docs | swagger-jsdoc + swagger-ui-express | OpenAPI documentation |

### 4.4 Project Structure

```
src/
├── app.js                              # Express app (helmet, CORS, rate-limit, error handler)
├── server.js                           # HTTP server (Prisma connect, Redis init, graceful shutdown)
├── config/
│   ├── index.js                        # Central export barrel
│   ├── env.js                          # Zod-validated environment config
│   ├── constants.js                    # Roles, statuses, limits, pagination
│   ├── system_messages.js              # Centralized user-facing messages
│   ├── logger.js                       # Pino (pretty dev, JSON prod)
│   ├── redis.js                        # Redis client (create, get, close)
│   └── swagger.js                      # Swagger spec generation
├── database/
│   ├── index.js                        # Prisma client singleton
│   ├── schema.prisma                   # Full database schema
│   ├── seed.js                         # Seed script
│   └── migrations/                     # Prisma migration files
├── middlewares/
│   ├── logging.middleware.js           # pino-http
│   ├── rate-limit.middleware.js        # Global + auth-specific limiters
│   └── rbac.middleware.js              # requireAuth + requireRole
├── modules/
│   ├── auth/                           # controller, service, routes, schema, middleware (JWT)
│   ├── events/                         # controller, service, routes, schema
│   ├── tickets/                        # controller, service, routes, schema, qr.service
│   ├── registrations/                  # controller, service, routes, schema, import.service, public.service
│   ├── checkins/                       # controller, service, routes, schema, duplicate-detector
│   ├── staff/                          # controller, service, routes, schema
│   ├── notifications/                  # email.service, notification.service, templates/*.html
│   ├── reports/                        # dashboard.service, analytics.service, export.service
│   ├── admin/                          # controller, service, audit.service
│   └── pdf/                            # ticket-pdf.service (pdfkit)
├── integrations/
│   ├── email/                          # brevo.js, templates.js
│   └── sentry/                         # client.js
├── realtime/                           # socket.js, rooms.js
├── routes/                             # index.js, v1.js, health.js
└── utils/                              # crypto.js, error.js, response.js, validators.js, id-generator.js
```

Root files: `.env.example`, `Dockerfile` (multi-stage), `docker-compose.yml` (Postgres 15 + Redis 7), `eslint.config.js`, `vitest.config.js`, `package.json`, `CONTRIBUTING.md`. `.github/` contains CI/CD workflows, PR template, branch protection, CODEOWNERS.

---

## 5. Database Schema

PostgreSQL via Prisma ORM. 13 models, 11 enums. Columns use `snake_case` via `@map`; application code uses `camelCase`. See `src/database/schema.prisma` for the live definition; a visual ERD lives in `docs/ERD.dbml` (paste into dbdiagram.io).

### 5.1 Enums

```prisma
enum UserRole             { ATTENDEE  STAFF  ORGANIZER  ADMIN }
enum UserStatus           { ACTIVE  INACTIVE  SUSPENDED }
enum EventStatus          { DRAFT  PUBLISHED  ACTIVE  COMPLETED  CANCELLED }
enum TicketCodeStatus     { UNUSED  USED  REVOKED }
enum RegistrationStatus   { PENDING  CONFIRMED  CANCELLED }
enum CheckInResult        { VALID  DUPLICATE  INVALID  EXPIRED  WRONG_EVENT  REVOKED  NOT_AUTHORIZED }
enum PaymentStatus        { PENDING  SUCCESS  FAILED  REFUNDED }
enum InvoiceStatus        { PENDING  PAID  OVERDUE  CANCELLED }
enum NotificationStatus   { PENDING  SENT  FAILED  READ }
enum RegistrationMode     { PUBLIC_LINK  CLOSED_IMPORT  HYBRID }
enum RegistrationSource   { IMPORT  PUBLIC_LINK }
```

### 5.2 Models

**User** - id (uuid), name, email (unique), passwordHash (bcrypt 12), role (default ATTENDEE, server-side only), status (ACTIVE), createdAt, updatedAt, deletedAt (soft delete). Relations: events, staffAssignments, auditLogs, checkins.

**Event** - id, title, description?, venue?, startTime, endTime, status (DRAFT), ownerId (FK→User), slug (unique, `{kebab-title}-{6-char-suffix}`), registrationMode (PUBLIC_LINK/CLOSED_IMPORT/HYBRID), isPaid (false), capacity?, currency (NGN), registrationOpensAt?, registrationClosesAt?, publishedAt?, createdAt, updatedAt, deletedAt. Indexes: [ownerId], [status], [slug]. Relations: owner, staffAssignments, ticketTypes, importBatches, registrations, checkins, ticketCodes, payments, invoices, notifications.

**TicketType** - id, eventId (FK→Event), name, description?, price (naira, 0=free), capacity?, quantitySold (0), active (true), sortOrder (0), createdAt, updatedAt. Index: [eventId]. Relations: event, registrations.

**Registration** - id, eventId (FK→Event), ticketCodeId (unique, FK→TicketCode), attendeeEmail, attendeeName, phone?, ticketTypeId? (FK→TicketType), paymentStatus (PENDING), source (IMPORT/PUBLIC_LINK), confirmationCode? (unique), metadata? (Json), qrIssued (false), qrIssuedAt?, status (PENDING/CONFIRMED/CANCELLED), createdAt, updatedAt. Unique: [eventId, attendeeEmail]. Indexes: [eventId], [attendeeEmail]. Relations: event, ticketCode, ticketType, qrToken, checkins, payment, notifications.

**TicketCode** - id, eventId (FK→Event), code, status (UNUSED), usedAt?, attendeeEmail?, attendeeName?, createdAt. Unique: [eventId, code]. Indexes: [eventId], [code].

**QrToken** - id, registrationId (unique, FK→Registration), tokenHash (unique, SHA-256), issuedAt, expiresAt (event.endTime + 24h), revokedAt?, scanCount (0). Index: [tokenHash]. Only hash stored; raw token delivered to attendee.

**CheckIn** - id, eventId (FK→Event), registrationId (FK→Registration), staffId (FK→User), scannedAt, result (VALID/DUPLICATE/INVALID/EXPIRED/WRONG_EVENT/REVOKED/NOT_AUTHORIZED), deviceInfo?, ipAddress?, deletedAt? (soft delete on undo). Unique: [eventId, registrationId]. Indexes: [eventId], [registrationId].

**Payment** (schema-ready) - id, eventId (FK→Event), userId (FK→User), registrationId? (unique, FK→Registration), paystackReference (unique), amount, currency (NGN), status (PENDING/SUCCESS/FAILED/REFUNDED), gateway (PAYSTACK), metadata? (Json), verifiedAt?, createdAt, paidAt?. Indexes: [eventId], [userId], [paystackReference]. Relations: event, user, registration, invoice. Not wired to any endpoint in the current MVP.

**Invoice** (schema-ready) - id, eventId (FK→Event), paymentId (unique, FK→Payment), invoiceNumber (unique), amount, issueDate, dueDate, status (PENDING/PAID/OVERDUE/CANCELLED). Index: [eventId]. Relations: event, payment. Not wired to any endpoint in the current MVP.

**Notification** - id, recipient, channel, template, subject?, context? (Json), status (PENDING), userId? (FK→User), eventId? (FK→Event), registrationId? (FK→Registration), providerMessageId?, failureReason?, sentAt?, readAt?, createdAt. Index: [recipient]. Failures never block core actions.

**AuditLog** - id, actorId? (FK→User, nullable for webhooks), action, entity, entityId, beforeSnapshot? (Json), afterSnapshot? (Json), createdAt. Indexes: [actorId], [entity, entityId].

**EventStaffAssignment** - id, eventId (FK→Event), userId (FK→User), permissionScope?, active (true), assignedAt. Unique: [eventId, userId].

**ImportBatch** - id, eventId (FK→Event), uploadedById (FK→User), originalFilename, fileType (csv/xlsx/pdf/docx), totalRows, successRows, failedRows, status (PROCESSING/COMPLETED/FAILED), errorReport? (Json), createdAt, completedAt?. Index: [eventId].

---

## 6. Event Creation Flows

### 6.1 Flow A: Closed Import

1. Organizer creates event (DRAFT, `registrationMode = CLOSED_IMPORT | HYBRID`)
2. Configures ticket types, optional capacity per event and per type
3. Uploads attendee list via CSV/XLSX/PDF/DOCX (5MB max)

| Format | Library | Method |
|--------|---------|--------|
| CSV | `csv-parse` | Row/column parsing |
| XLSX | `xlsx` | Sheet-to-JSON conversion |
| PDF | `pdf-parse` | Text extraction → table detection → row parsing |
| DOCX | `mammoth` | HTML conversion → `<table>` extraction → row parsing |

**Template columns:** `name` (required), `email` or `phone` (at least one), `ticketType` (optional), `organization` (optional)

4. Validates each row: required fields, valid ticketType, no duplicate email/phone per event, capacity check
5. Creates Registration (source=IMPORT, status=CONFIRMED) + TicketCode + QR token per row
6. Sends QR email where email present
7. Returns: `{ totalRows, successRows, failedRows, errors: [...] }`

### 6.2 Flow B: Public Link Registration

1. Organizer publishes event → slug generated, status → PUBLISHED
2. Attendee visits `GET /api/v1/e/{slug}` → sees event details + ticket types
3. Submits via `POST /api/v1/registrations/free`: `{ slug, name, email, phone?, ticketTypeId?, metadata? }`
4. Registration (CONFIRMED) → TicketCode → QR → email → audit

---

## 7. API Endpoints

All under `/api/v1` unless noted. Zod validation, auth middleware, RBAC, consistent envelopes: `{ status: "success"|"error", message, data? }`. Current totals: 11 tags, 47 paths, 56 operations. Full reference: `docs/QPASS_API_DOC.md`.

### 7.1 Auth

| # | Method | Endpoint | Auth | Rate Limit | Purpose |
|---|--------|----------|------|------------|---------|
| 1 | POST | `/auth/register` | Public | authLimiter (5/15min) | `{ name, email, password, role? }`. Default role: ATTENDEE. Optional `role` may be `ATTENDEE`, `ORGANIZER`, or `STAFF`; `ADMIN` is not self-assignable. Creates a Redis session. |
| 2 | POST | `/auth/login` | Public | authLimiter | `{ email, password }` → `{ user: { id, name, email, role }, accessToken, refreshToken }`. Creates a Redis session. |
| 3 | POST | `/auth/refresh` | Valid refresh token + active session | authLimiter | Rotate access token. Atomically consumes the refresh-token session (GETDEL); concurrent same-token refreshes are rejected. Records the new session. |
| 4 | POST | `/auth/logout` | Authenticated | - | Blacklist refresh token + delete its Redis session. |
| 5 | POST | `/auth/forgot-password` | Public | authLimiter | Send reset email with time-limited token (Redis, 15 min TTL). |
| 6 | POST | `/auth/reset-password` | Public | authLimiter | `{ token, password }`. |
| 7 | GET | `/auth/me` | Authenticated | - | Get own profile (id, name, email, role, phone, emailVerifiedAt). |
| 8 | PATCH | `/auth/me` | Authenticated | - | Update `name` / `phone`. |
| 9 | POST | `/auth/change-password` | Authenticated | authLimiter | `{ currentPassword, newPassword }`; verifies current password. |
| 10 | POST | `/auth/request-verification` | Authenticated | authLimiter | Send email-verification email (Redis, 15 min TTL); 400 if already verified. |
| 11 | POST | `/auth/verify-email` | Public | authLimiter | `{ token }`; sets `emailVerifiedAt`. |
| 12 | POST | `/auth/otp/send` | Public | authLimiter | `{ email }`. Sends a 6-digit email-verification code (Redis, 10 min TTL). Always responds 200 to avoid leaking account existence. Non-production returns the code. |
| 13 | POST | `/auth/otp/verify` | Public | authLimiter | `{ email, code }`; sets `emailVerifiedAt`. Single-use; 401 on invalid/expired code. |
| 14 | GET | `/auth/sessions` | Authenticated | - | List active Redis sessions. |
| 15 | DELETE | `/auth/sessions/{sessionId}` | Authenticated | - | Revoke a session (id = 64-char refresh-token hash). |
| 16 | GET | `/auth/google` | Public | authLimiter | Start "Sign in with Google". 302 to Google consent screen. Optional `?role=ATTENDEE\|ORGANIZER\|STAFF` (default ATTENDEE); 422 for invalid role. |
| 17 | GET | `/auth/google/callback` | Public | - | Google redirect target. Exchanges code → verifies `email_verified` → creates (signup) or matches (login) the user → 302 to `OAUTH_FRONTEND_REDIRECT_URL` with the tokens in the URL **fragment** (`#access_token&refresh_token&mode=signup\|login`; never the query string). Failures redirect with `?error&error_description` query params instead. |

**Token specs:** Access: 30min. Refresh: 7d. Registration defaults to ATTENDEE; an optional `role` (`ATTENDEE`/`ORGANIZER`/`STAFF`) may be supplied, and `ADMIN` cannot be self-assigned.

### 7.2 Events

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 18 | POST | `/events` | Organizer/Admin | Create draft |
| 19 | GET | `/events` | Organizer/Admin | List `?page,limit,status` |
| 20 | GET | `/events/:eventId` | Owner | Get details |
| 21 | PATCH | `/events/:eventId` | Owner | Edit |
| 22 | DELETE | `/events/:eventId` | Owner | Soft delete (deletedAt) |
| 23 | POST | `/events/:eventId/publish` | Owner | Publish (slug generated) |
| 24 | POST | `/events/:eventId/unpublish` | Owner | Unpublish (PUBLISHED/ACTIVE back to DRAFT; slug preserved) |
| 25 | POST | `/events/:eventId/cancel` | Owner | Cancel (draft cannot be cancelled) |

### 7.3 Ticket Types

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 26 | POST | `/events/:eventId/ticket-types` | Owner | Create `{ name, description?, price, capacity? }` |
| 27 | GET | `/events/:eventId/ticket-types` | Owner | List |
| 28 | PATCH | `/events/:eventId/ticket-types/:id` | Owner | Edit |
| 29 | DELETE | `/events/:eventId/ticket-types/:id` | Owner | Delete (409 if registrations linked) |

### 7.4 Attendee Import

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 30 | POST | `/events/:eventId/import` | Owner | Upload CSV/XLSX/PDF/DOCX (Multer, 5MB max) |
| 31 | GET | `/events/:eventId/import` | Owner | List import batches |
| 32 | GET | `/events/:eventId/import/:batchId` | Owner | Import results + per-row errors |
| 33 | GET | `/events/:eventId/import-template` | Owner | Download CSV or PDF template (?format=csv\|pdf, default csv) |

### 7.5 Public Registration

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 34 | GET | `/e/:slug` | Public | Event details + ticket types (no ownerId) |
| 35 | POST | `/registrations/free` | Public | Register for a free event. No account required. Instant confirmation + QR. |

### 7.6 Tickets

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 36 | GET | `/events/:eventId/tickets` | Owner | List `?page,limit,status,paymentStatus` |
| 37 | POST | `/events/:eventId/tickets/export` | Owner | Export CSV/PDF `{ format }` |
| 38 | GET | `/tickets/:ticketId` | Authenticated | View ticket + QR (attendee or event owner) |
| 39 | GET | `/tickets/:ticketId/download` | Authenticated | Download PDF (pdfkit). Event details, attendee info, QR code, confirmation code. Filename: `{event-slug}-ticket.pdf` |
| 40 | GET | `/tickets/me` | Authenticated | List the caller's own tickets (history) matched by email. `?page,limit` (max 100). Excludes soft-deleted/cancelled events; cancelled registrations on live events still shown. Includes event, ticket type, ticket code, `checkedIn`. |

### 7.7 Staff Management

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 41 | POST | `/events/:eventId/staff` | Owner | Invite/assign `{ email, permissionScope? }`. Creates pending user if not exists + invite email. Response includes event summary (title, venue, startTime, endTime). |
| 42 | GET | `/events/:eventId/staff` | Owner | List active staff. Response includes event summary (title, venue, startTime, endTime). |
| 43 | DELETE | `/events/:eventId/staff/:staffId` | Owner | Remove |

### 7.8 Check-in

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 44 | POST | `/checkins/:eventId/scan` | Staff (assigned) | Scan `{ token, deviceInfo? }` |
| 45 | GET | `/checkins/:eventId/checkins` | Organizer/Staff | List (excludes undone) |
| 46 | GET | `/checkins/stats` | Admin / Owner/Staff | Aggregate stats. Without `eventId`: system-wide (ADMIN only). With `eventId`: owner/Admin/active staff. Returns `{ checkins: { total, valid, duplicate }, uniqueAttendeesCheckedIn, eventsWithCheckins }` |
| 47 | POST | `/checkins/:eventId/checkins/:checkInId/undo` | Owner/scanning staff | Undo within 24h |

Scan results: `VALID | DUPLICATE | INVALID | EXPIRED | WRONG_EVENT | REVOKED | NOT_AUTHORIZED`. All HTTP 200 except NOT_AUTHORIZED (403).

### 7.9 Reports & Dashboard

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 48 | GET | `/events/:eventId/dashboard` | Owner/Admin/Staff | Stats: registrations, check-ins, capacity, ticket breakdown |
| 49 | GET | `/events/:eventId/exports/attendance` | Owner | Export attendance CSV/PDF |
| 50 | GET | `/events/:eventId/exports/registrations` | Owner | Export registrations CSV/PDF |
| 51 | GET | `/analytics/overview` | Authenticated | Overview totals: events, published events, registrations, distinct attendees, registered attendee accounts. `?scope=own\|system` (system is ADMIN only). Non-ADMINs always scoped to own events. |

### 7.10 Admin

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 52 | GET | `/audit-logs` | Admin | Paginated audit trail. Filter by action, entity, actorId, date range. |
| 53 | POST | `/admin/invites` | Admin | Invite `{ email }` to become an ADMIN. Emails a single-use invite link (7-day Redis TTL); invitee sets their own password. 409 if the email belongs to an existing non-admin account (use promote instead). |
| 54 | POST | `/admin/invites/:token/accept` | Public (authLimiter) | `{ name, password }` — accept the invite, set own password, create the ADMIN account (or reactivate a soft-deleted user with that email). Single-use. 401 invalid/expired, 409 existing account. |
| 55 | PATCH | `/admin/users/:userId/promote` | Admin | Promote a user to ADMIN (idempotent; cannot target your own account). |

### 7.11 Health

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 56 | GET | `/health` | Public | DB + Redis status. 200 or 503. |

---

## 8. QR Code & Check-in System

### 8.1 QR Generation

1. `crypto.randomBytes(32).toString("hex")` → 64-char raw token
2. `SHA-256(rawToken)` → `tokenHash` (only hash stored in DB)
3. `QRCode.toDataURL(rawToken)` → base64 image for email/web/PDF
4. Store `QrToken`: `{ tokenHash, registrationId, expiresAt: event.endTime + 24h }`
5. Raw token delivered to attendee only (email, web, PDF)

**Payload:** Single opaque hex string (64 chars). No JSON; prevents info leakage if photographed.

### 8.2 Check-in Flow

1. Hash scanned token → SHA-256
2. Acquire Redis lock: `SETNX lock:checkin:{eventId}:{tokenHash}` (TTL 10s). Lock fail → conflict.
3. Lookup `QrToken` by `tokenHash`
4. Validate: not found → `INVALID` | expired → `EXPIRED` | wrong event → `WRONG_EVENT` | revoked → `REVOKED`
5. Check `CheckIn` unique constraint `(eventId, registrationId)` → exists → `DUPLICATE` (audit log attempt)
6. All pass → create CheckIn (VALID) → update QrToken (scanCount++, revokedAt=now) → audit log → emit Socket.IO → release lock

**Duplicate detection:** Two-layer - Redis distributed lock (race condition prevention) + PostgreSQL unique constraint `(eventId, registrationId)`.

**Staff authorization:** Check `EventStaffAssignment` before QR validation. Not assigned → 403 `NOT_AUTHORIZED`.

**Real-time:** Emit to room `event:{eventId}:dashboard`: `{ result, attendeeName, totalCheckedIn, timestamp }`.

---

## 9. Email Service (Brevo REST API)

Uses the Brevo transactional email REST API (axios) instead of SMTP so email works on Railway/Vercel and other hosts where SMTP ports are blocked.

```env
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@qpass.com  |  BREVO_SENDER_NAME=QPass
```

| Template | Trigger | Subject |
|----------|---------|---------|
| `registration-confirmed.html` | Registration confirmed | Registration Confirmed - {eventTitle} |
| `qr-generated.html` | QR issued | Your QR Ticket - {eventTitle} |
| `staff-invitation.html` | Staff assigned | You're Invited as Staff - {eventTitle} |
| `password-reset.html` | Reset requested | Reset Your QPass Password |

**Flow:** Create Notification (PENDING) → render template → Brevo REST send → update SENT/FAILED with `providerMessageId`/`failureReason`. **Non-blocking:** email failures never block core actions. Transient failures (rate limit, 5xx, network/timeout) retry up to 3 times; bad credentials and invalid recipients fail fast without retry. If `BREVO_API_KEY` is missing, sends are skipped with a warning.

---

## 10. PDF Ticket Downloads

> **Note:** Payment status is not included in MVP - all tickets are confirmed on registration.

`GET /tickets/:ticketId/download`; generated on-demand via `pdfkit`.

**Contents:** QPass header, event name/date/venue, attendee name/email, ticket type, QR code (inline PNG via `qrcode`), confirmation code, check-in instructions. Response: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="{event-slug}-ticket.pdf"`.

---

## 11. PDF/DOCX Attendee File Parsing

| Format | Library | Method |
|--------|---------|--------|
| CSV | `csv-parse` | Stream parsing with header detection |
| XLSX | `xlsx` | `XLSX.utils.sheet_to_json()` |
| PDF | `pdf-parse` | Text extraction → table detection → row parsing. Fallback: line-by-line with email/phone pattern detection. |
| DOCX | `mammoth` | `convertToHtml()` → `<table>` extraction → row parsing |

**Error handling:** Row-level errors in `ImportBatch.errorReport` JSON (`{ row, field, error }[]`). Partial imports allowed. Invalid rows counted in `failedRows`.

---

## 12. Real-time System (Socket.IO)

Attached to HTTP server in `server.js`. CORS via `SOCKET_CORS_ORIGIN`.

| Room | Purpose | Events Emitted |
|------|---------|---------------|
| `event:{eventId}:dashboard` | Live check-in + registration updates | `checkin:update` `{ result, attendeeName, totalCheckedIn, timestamp }`, `registration:new` `{ registrationId, attendeeName, timestamp }` |
| `event:{eventId}:scan` | Scan result feedback to staff | `scan:result` `{ result, message, attendee? }` |

Client auth: JWT in handshake auth header, validated server-side.

---

## 13. Security

| Concern | Implementation |
|---------|---------------|
| Auth | JWT (30min access / 7d refresh). Bcrypt 12 rounds. Refresh rotation with Redis blacklist. |
| Google OAuth | OAuth 2.0 authorization-code flow. Random `state` stored in Redis (single-use GETDEL, 10-min TTL) prevents CSRF. Server-side token exchange. Email must be `email_verified`; suspended accounts rejected. |
| RBAC | Organizer → own events. Staff → assigned events. Admin → cross-platform read. Role set server-side only. |
| Input | Zod schemas every endpoint. File type + size (5MB, CSV/XLSX/PDF/DOCX). |
| PII | Name, email, phone, metadata only. No PII in QR payload. No public attendee list. |
| QR | Opaque random token, SHA-256 hashed, event-bound, one-time use, expires event+24h. |
| Audit | All key actions: actor (nullable for webhooks), entity, ID, before/after snapshots. |
| Rate limit | Global: 100/15min. Auth: 5/15min. Health excluded. |
| Transport | HTTPS production. Helmet headers. Generic error messages. Prisma parameterized queries. |

---

## 14. Implementation Plan

### Phase 1: Foundation (Days 1-3); Auth + Events + Ticket Types

| Task | Details |
|------|---------|
| Schema migration | New enums (RegistrationMode, RegistrationSource), new fields on User/Event/Registration/Notification/AuditLog, new models (TicketType, ImportBatch) |
| Auth module | Register, login, refresh, logout, password reset, Google OAuth (authorization-code, sign-up + sign-in). JWT + bcrypt + Redis blacklist. `requireAuth` middleware. Optional `role` at registration (default ATTENDEE; ADMIN not self-assignable), rate limit, generic errors. |
| Event CRUD | Create (DRAFT), list (paginated, filter by status), get, edit, publish (slug), unpublish (slug preserved), cancel. Ownership enforcement. |
| TicketType CRUD | Create, list, edit, delete (only if no registrations). Per-event scoped. |
| Validate + routes | Zod middleware wrapper. Wire all routes in `v1.js`. Initialize Socket.IO. |

**Exit:** Organizer can register/login, create/publish events, configure tickets. Swagger shows all endpoints.

### Phase 2: Registration & QR (Days 4-7); Both Flows + Import + Email

| Task | Details |
|------|---------|
| File parsers | CSV (csv-parse), XLSX (xlsx), PDF (pdf-parse + table detection), DOCX (mammoth + table extraction) |
| Import service | Row validation, ImportBatch tracking, registration + QR creation per row, error reporting |
| Public registration | Slug lookup, confirm registration, issue QR |
| QR service | Token generation, SHA-256 hashing, image creation |
| Ticket routes | View, list, PDF download (pdfkit) |
| Email service | Brevo REST API, 4 templates, Notification record tracking || Upload middleware | Multer (CSV/XLSX/PDF/DOCX, 5MB) |
| Staff management | Assign/remove, invite email for new users |

**Exit:** Import works for all 4 formats. Public registration works. QR emailed. Tickets downloadable as PDF. Staff assignable.

### Phase 3: Check-in, Reporting & Release (Days 8-14); Scan + Real-time + Stats + Deploy

| Task | Details |
|------|---------|
| Socket.IO | Server init, CORS, JWT auth, room management |
| Enhance checkins | Staff auth check, Socket.IO emission on scan, undo endpoint |
| Dashboard + exports | Stats service, PDF/CSV export (attendance + registrations), audit log queries |
| Seed + docs | Admin/organizer users, sample events, Swagger annotations |
| Tests | Integration (auth, events, registrations, check-ins), Unit (QR, import, auth) |
| Deploy | Railway config, security pass, lint clean |

**Exit:** All scan results correct. Dashboard real-time. Tests pass. Lint clean. Deployed. Health 200.

> **Phase 2 deferred:** Payment processing (Paystack integration, paid registration, webhooks) is deferred to a future phase. All registrations are confirmed immediately on registration.

---

## 15. Testing

### Unit Tests

| Module | Focus |
|--------|-------|
| `auth.service` | Password hashing, token gen, refresh rotation, blacklist |
| `oauth.service` | State TTL/single-use, token exchange, user find-or-create, role + status handling |
| `qr.service` | Token gen, hash uniqueness, expiry |
| `import.service` | Row validation, CSV/XLSX/PDF/DOCX parsing, duplicates, capacity |
| `ticket-pdf.service` | PDF generation, QR embedding, content correctness |

### Integration Tests

| Module | Scenarios |
|--------|-----------|
| `auth` | Register → login → refresh → logout → password reset → unauthorized |
| `events` | Create → edit → publish → list → cancel → unauthorized |
| `registrations` | Registration → capacity → duplicate → CSV/PDF/DOCX import |
| `checkins` | Valid → duplicate → wrong event → expired → unauthorized → undo |

```bash
npm run test:run       # All tests
npm run test:coverage  # With coverage
npm run lint           # Lint check
```

**Test env:** Separate PostgreSQL (`qpass_test`), Redis DB 1, Mailtrap/Ethereal for email.

---

## 16. Deployment

### Docker

Multi-stage `Dockerfile`: builder (`node:22-alpine`, `npm ci`, `prisma generate`) → production (non-root user, copied artifacts). `docker-compose.yml`: `postgres:15-alpine` (host port 5433), `redis:7-alpine` (host port 6380), named volumes, health checks.

### Railway (primary)

`railway.json` enables one-click deployment. Build: `npm ci && npx prisma generate`. Start: `node src/server.js`. Set `DATABASE_URL` and `REDIS_*` to managed service URLs, then run `npx prisma migrate deploy` as a post-deploy step.

### Environment Variables

```
NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGIN, SWAGGER_ENABLED,
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DATABASE_URL,
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DATABASE,
JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN,
PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, PAYSTACK_WEBHOOK_SECRET (optional, Phase 2),
BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME,
FRONTEND_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, OAUTH_FRONTEND_REDIRECT_URL,
SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE, SOCKET_CORS_ORIGIN, UPLOAD_DIR
```

### Post-Deploy

1. `GET /health` → 200 with `{ database: "ok", redis: "ok" }`
2. `/api-docs` loads Swagger UI
3. Register → login → create event → send test email
4. `GET /api/v1/auth/google` → Google consent screen → callback → redirect to dashboard with tokens

---

## 17. Acceptance Criteria

| # | Scenario | Criteria |
|---|----------|----------|
| 1 | Organizer creates event | Register → login → create (DRAFT) → edit → publish (slug generated) |
| 2 | Closed import | Upload CSV/XLSX/PDF/DOCX → summary with success/fail → attendees appear → QR emailed → duplicates flagged |
| 3 | Public registration | Visit `/e/{slug}` → see event + tickets → register → CONFIRMED + QR email |
| 4 | Staff check-in (VALID) | Assigned staff scans → VALID → name returned → dashboard updates |
| 5 | Duplicate scan | Second scan → DUPLICATE → no new record |
| 6 | Wrong event scan | QR from Event A at Event B → WRONG_EVENT |
| 7 | Unauthorized staff | Non-assigned staff → 403 NOT_AUTHORIZED |
| 8 | Dashboard stats | Correct counts. Real-time updates during event. |
| 9 | CSV/PDF export | Attendance/registration CSV/PDF opens correctly |
| 10 | PDF ticket download | PDF with QR, event details, ticket type |
| 11 | Audit trail | All key actions logged with actor, entity, timestamp |
| 12 | Email delivery | All emails via Brevo REST API. Notification records track SENT/FAILED. |
| 13 | Password reset | Request → email → link → new password → login works |
| 14 | Health check | `GET /health` → 200 with DB + Redis status |
| 15 | Google OAuth | `GET /auth/google` → Google consent screen → callback → redirect to dashboard with `access_token` + `refresh_token` + `mode` (signup/login) |

---

## 18. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Poor internet at venue | MVP: require online. Future: offline scan mode. |
| QR screenshot sharing | One-time use + revocation. Future: rotating/dynamic QR. |
| Server downtime | Health checks, auto-restart, connection pooling. |
| Camera failure | Manual lookup by name/email fallback. |
| File parsing failures | Row-level errors, partial imports, graceful degradation. |
| Email failure | Non-blocking. Notification tracks failure. |


*QPass Backend TRD | July 2026 | Crosstrack Group 13*
