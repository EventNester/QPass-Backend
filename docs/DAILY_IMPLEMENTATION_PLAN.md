# QPass Backend — Phase 1 & 2 Implementation Plan

**Team:** John Ughiovhe (Lead), Francis Anya, Okuo John, Emmanuel Imoh, Nash Lucas
**Duration:** 7 working days (Phase 1: Days 1–3, Phase 2: Days 4–7)
**Branch strategy:** Feature branches from `dev`, PR → John reviews → merge

---

## Phase 1 (Days 1–3): Auth + Events + Ticket Types

### Day 1 — Schema + Parallel Module Start

| Dev | Task | Branch/Files | Blocked By |
|-----|------|-------------|------------|
| **John** | Schema migration: add `RegistrationMode`, `RegistrationSource` enums; `TicketType`, `ImportBatch` models; missing fields on Event (`slug`, `registrationMode`, `isPaid`, `capacity`, `currency`, `registrationOpensAt`, `registrationClosesAt`, `publishedAt`), Registration (`phone`, `ticketTypeId`, `paymentStatus`, `source`, `confirmationCode`, `metadata`), Payment (`registrationId`, `gateway`, `metadata`, `verifiedAt`), Notification (`userId`, `eventId`, `registrationId`, `providerMessageId`, `failureReason`), AuditLog (`actorId` nullable). Run `prisma migrate dev` | `schema.prisma` | **Nobody** — critical path, finish ASAP |
| **John** | Socket.IO init: create `src/realtime/socket.js` (attach to HTTP server, CORS, JWT handshake auth) + `src/realtime/rooms.js` (join/leave `event:{id}:dashboard`) | `server.js`, `src/realtime/` | **Nobody** |
| **Francis** | Auth password forgot: `POST /auth/password/forgot` — generate time-limited reset token (`crypto.randomBytes`), store hash in Redis with TTL, return generic success. Schema + routes + service | `src/modules/auth/` | **Nobody** — fully independent |
| **Francis** | Auth password reset: `POST /auth/password/reset` — verify token from Redis, hash new password, update user, invalidate token | `src/modules/auth/` | **Self** (depends on own password-forgot work) |
| **Okuo** | Event publish: `POST /events/:eventId/publish` — validate status is DRAFT, generate slug (`kebab-title-6chars`), set `status=PUBLISHED`, `publishedAt=now()`. Create `src/utils/slug.js` utility | `src/modules/events/`, `src/utils/slug.js` | **Nobody** — can write logic now, adjust after John's schema migration lands |
| **Okuo** | Event cancel: `POST /events/:eventId/cancel` — set `status=CANCELLED`. Fix existing DELETE to use status change instead of soft-delete | `src/modules/events/` | **Nobody** |
| **Emmanuel** | TicketType CRUD module: full `src/modules/tickets/` — controller, service, routes, schema. Create + List + Edit + Delete (guard: reject if registrations exist). Per-event scoping | `src/modules/tickets/` | **Nobody** — can write module structure now, wire Prisma queries after John's migration lands |
| **Nash** | Swagger: update `docs/swagger-definition.json` — add Event schemas (create/update/publish/cancel), TicketType schemas, Registration schemas. Add missing component schemas | `docs/swagger-definition.json` | **Nobody** — fully independent |
| **Nash** | JSDoc annotations for auth routes (`register`, `login`, `refresh`, `logout`, `password/forgot`, `password/reset`) | `src/modules/auth/auth.routes.js` | **Francis** — annotate after Francis's password-reset PR merges (or annotate the routes as Francis creates them) |

### Day 2 — Completion + Route Wiring + Tests

| Dev | Task | Files | Blocked By |
|-----|------|-------|------------|
| **John** | Wire all Phase 1 routes in `v1.js` (tickets). Add status filter to `listEvents` (`?status=DRAFT`). Socket.IO emit on event publish/cancel | `v1.js`, `event.service.js`, `event.routes.js` | **Emmanuel** — needs ticket routes to exist before wiring in `v1.js`. Wait for Emmanuel's PR or rebase on it. |
| **Francis** | Email service setup: Nodemailer config (`src/config/email.js`), SMTP transport. Create `src/integrations/email/smtp.js`. Wire into password reset (send reset link email). Create `password-reset.html` template | `src/config/email.js`, `src/integrations/email/`, templates | **Nobody** — fully independent |
| **Okuo** | Event unit tests: publish, cancel, slug generation, status filter, ownership enforcement | `src/modules/events/tests/` | **Self** (tests own Day 1 work). Needs John's schema merged to run Prisma queries. |
| **Okuo** | Event integration tests: create → publish (verify slug) → cancel → list by status | `src/tests/integration/` | **John** — needs schema migration merged for DB to work |
| **Emmanuel** | TicketType unit tests: CRUD, delete guard (with/without registrations), per-event scoping, ownership | `src/modules/tickets/tests/` | **Self** (tests own Day 1 work). Needs John's schema merged to run Prisma queries. |
| **Nash** | JSDoc annotations for event routes (create, list, get, edit, publish, cancel) + ticket routes (create, list, edit, delete) | `event.routes.js`, `tickets.routes.js` | **Okuo + Emmanuel** — annotate after their PRs merge. Annotate event routes after Okuo merges, ticket routes after Emmanuel merges. |
| **Nash** | Swagger UI verification: `/api-docs` loads, all Phase 1 paths render | manual + `swagger-definition.json` | **All** — needs all routes to exist |

### Day 3 — Integration + Exit Verification

| Dev | Task | Files | Blocked By |
|-----|------|-------|------------|
| **John** | Full Phase 1 integration test run. Code review all PRs. Merge to `dev` | — | **Francis, Okuo, Emmanuel, Nash** — needs all PRs submitted |
| **Francis** | Remaining email templates: registration confirmed, QR generated (placeholder for Phase 2). Integration test: register → forgot password → reset → login works | templates, tests | **John** — needs schema merged for full integration test |
| **Okuo** | Edge cases: publish non-DRAFT event (400), cancel non-CANCELLED, slug collision handling. Integration test: full event lifecycle | tests | **John** — needs schema merged |
| **Emmanuel** | TicketType integration tests: full CRUD lifecycle, delete with registrations (verify 400), capacity validation | tests | **John** — needs schema merged |
| **Nash** | Final Swagger review — all Phase 1 endpoints documented. Route wiring verification. Phase 1 exit checklist | — | **John** — needs all routes wired in `v1.js` |

**Phase 1 Exit Criterion:** Organizer can register/login, create/publish events, configure tickets. Swagger shows all endpoints. ✅

---

## Phase 2 (Days 4–7): Registration & QR + Import + Email + Staff

### Day 4 — QR + File Parsers + Public Routes + Email Templates

| Dev | Task | Files | Blocked By |
|-----|------|-------|------------|
| **John** | QR service: `src/modules/tickets/qr.service.js` — `generateToken()` (crypto.randomBytes(32) → hex), `hashToken()` (SHA-256), `createQrImage()` (qrcode.toDataURL), `validateToken()`. Wire into registration flow | `src/modules/tickets/qr.service.js` | **Nobody** — **finish by noon, Okuo and Emmanuel are waiting** |
| **Francis** | Email templates: registration-confirmed, qr-generated, payment-success, staff-invitation, password-reset (5 total). `src/modules/notifications/templates/` | templates | **Nobody** — fully independent |
| **Francis** | Notification service: `createNotification()` → render template → send via SMTP → update SENT/FAILED. Non-blocking (fire-and-forget) | `src/modules/notifications/notification.service.js` | **Self** — depends on own email templates |
| **Okuo** | Public event view: `GET /public/events/:slug` — lookup by slug, return event + ticket types | `src/modules/public/` | **Nobody** — start with the view route (no QR needed) |
| **Okuo** | Public free registration: `POST /public/events/:slug/register` — create Registration + TicketCode + QR → email | `src/modules/public/` | **John** (QR service) — HARD block, cannot create QR without this. Start view route first, wire QR after John merges. |
| **Emmanuel** | Ticket view: `GET /tickets/:ticketId` — return ticket details | `src/modules/tickets/` | **Nobody** — start with non-QR parts |
| **Emmanuel** | Ticket list: `GET /events/:eventId/tickets` — paginated, filter by status | `src/modules/tickets/` | **Nobody** |
| **Emmanuel** | CSV/PDF export: `POST /events/:eventId/tickets/export` | `src/modules/tickets/` | **Nobody** |
| **Emmanuel** | QR data URL in ticket view | `src/modules/tickets/` | **John** (QR service) — HARD block for QR image generation |
| **Nash** | File parsers: `src/utils/parsers/csv.js` (csv-parse), `src/utils/parsers/xlsx.js` (xlsx), `src/utils/parsers/pdf.js` (pdf-parse + table detection), `src/utils/parsers/docx.js` (mammoth + table extraction). Each returns `{ name, email, phone, ticketType }[]` with row-level errors | `src/utils/parsers/` | **Nobody** — fully independent. **John needs these by end of day.** |

### Day 5 — Import + PDF + Paid Registration

| Dev | Task | Files | Blocked By |
|-----|------|-------|------------|
| **John** | Import service: `src/modules/registrations/import.service.js` — row validation, duplicate detection per event, capacity check, ImportBatch tracking. Creates Registration + TicketCode + QR per valid row. Returns `{ totalRows, successRows, failedRows, errors }` | `src/modules/registrations/import.service.js` | **Nash** (file parsers) — HARD block. Also needs own QR service (done Day 4). |
| **John** | Upload middleware: `src/middlewares/upload.middleware.js` — Multer config (CSV/XLSX/PDF/DOCX, 5MB max, file type validation) | `src/middlewares/upload.middleware.js` | **Nobody** |
| **Francis** | Wire email triggers: registration confirmed → email, QR issued → email, payment verified → email, staff assigned → email. All via Notification service | notification.service.js, various services | **Self** — needs own notification service (done Day 4) |
| **Okuo** | Public paid registration: create Registration (PENDING) + Payment (PENDING) → Paystack `/transaction/initialize` → return `{ registration, paymentUrl }` | `src/modules/public/` | **John** (QR service) — HARD block. **Francis** (email) — soft block, email can be wired after Francis merges. |
| **Emmanuel** | Ticket PDF download: `GET /tickets/:ticketId/download` — pdfkit: QPass header, event details, attendee info, QR code (inline PNG), confirmation code. `Content-Disposition: attachment; filename="{event-slug}-ticket.pdf"` | `src/modules/tickets/ticket-pdf.service.js` | **John** (QR service) — HARD block for QR image embedding |
| **Nash** | Import routes: `POST /events/:eventId/import` (with upload middleware), `GET /events/:eventId/import/:batchId` (results), `GET /events/:eventId/import-template` (CSV/PDF template download via `?format` query) | `src/modules/registrations/import.routes.js` | **John** (upload middleware) — needs middleware to exist for Multer integration. Can scaffold routes first, wire middleware after. |

### Day 6 — Staff + Integration Tests

| Dev | Task | Files | Blocked By |
|-----|------|-------|------------|
| **John** | Staff management: `POST /events/:eventId/staff` (assign/invite), `GET /events/:eventId/staff` (list), `DELETE /events/:eventId/staff/:staffId` (remove). If user doesn't exist, create pending user + send invite email | `src/modules/staff/` | **Francis** (email service) — HARD block for invite email. Can do assign/list/remove without email, but invite flow needs it. |
| **Francis** | Email integration tests: register → confirmation email sent, import → QR emails sent, password reset → email sent. Use Ethereal/Mailtrap for test SMTP | tests | **John** — needs import + registration flows merged to test email triggers end-to-end |
| **Okuo** | Public registration integration tests: free flow, paid flow, duplicate registration, capacity full. Import integration tests: CSV + XLSX | tests | **John** (import service + Nash parsers) for import tests. **Self** for registration tests. |
| **Emmanuel** | Ticket PDF integration tests: PDF generated with correct content, QR embedded. CSV/PDF export tests: file downloads, correct columns | tests | **John** (QR service) — needs QR to be generating images |
| **Nash** | Socket.IO integration: emit `checkin:update` on scan, `registration:new` on registration. Room join on connect. Staff management integration tests | tests | **John** (Socket.IO from Phase 1 + staff module) |

### Day 7 — Final Testing + Exit Verification

| Dev | Task | Files | Blocked By |
|-----|------|-------|------------|
| **John** | Full Phase 2 integration test run. Code review all PRs. Merge to `dev` | — | **All** — needs all PRs submitted |
| **Francis** | Email edge cases: invalid SMTP (non-blocking), template rendering errors, Notification FAILED tracking. Final email service polish | tests | **Nobody** |
| **Okuo** | Import edge cases: invalid file types, empty files, malformed rows, duplicate emails in same batch. Public registration edge cases | tests | **Nobody** |
| **Emmanuel** | PDF edge cases: long names, special characters, missing QR. CSV/PDF export edge cases: empty data, large datasets | tests | **Nobody** |
| **Nash** | Final Swagger review — all Phase 2 endpoints documented. Final route wiring in `v1.js` (public, registrations, staff, tickets). Phase 2 exit checklist | — | **John** — needs all routes wired |

**Phase 2 Exit Criterion:** Import works for all 4 formats. Public reg (free + paid) works. QR emailed. Tickets downloadable as PDF. Staff assignable. ✅

---

## Dependency Summary

### Hard Blocks (cannot proceed without)

| Upstream (Who) | Downstream (Whom) | What | Day |
|----------------|-------------------|------|-----|
| **John** (QR service) | **Okuo** (public registration) | QR token + image per attendee | Day 4 → Day 4-5 |
| **John** (QR service) | **Emmanuel** (ticket PDF) | QR image embedding in PDF | Day 4 → Day 5 |
| **John** (QR service) | **Okuo** (paid registration) | QR for paid flow confirmation | Day 4 → Day 5 |
| **Nash** (file parsers) | **John** (import service) | Parse CSV/XLSX/PDF/DOCX rows | Day 4 → Day 5 |
| **Francis** (email service) | **John** (staff invite) | Send invitation email to new staff | Day 4-5 → Day 6 |
| **Emmanuel** (ticket routes) | **John** (route wiring) | Mount ticket routes in `v1.js` | Day 1 → Day 2 |
| **John** (schema migration) | **Okuo, Emmanuel** (tests) | Prisma client generation for DB queries | Day 1 → Day 2 |

### Soft Blocks (can scaffold, wire in after)

| Upstream | Downstream | What | Day |
|----------|-----------|------|-----|
| **Francis** (email) | **Okuo** (paid registration) | Send confirmation email after payment | Day 4-5 → Day 5 |
| **Francis** (email) | **Okuo** (free registration) | Send confirmation email after reg | Day 4-5 → Day 4 |
| **John** (schema) | **Okuo, Emmanuel** (module logic) | Can write code against planned schema, adjust after | Day 1 → Day 1 |

### No Blockers (fully independent)

- **Francis** — password reset (Phase 1), email templates + notification service (Phase 2)
- **Nash** — Swagger/JSDoc (Phase 1), file parsers (Phase 2)
- **John** — schema migration, Socket.IO, QR service, upload middleware

### Merge Order (to minimize conflicts)

**Phase 1:** Francis → Emmanuel → Okuo → John → Nash
**Phase 2:** Nash (parsers) → John (QR) → Francis (email) → Emmanuel (PDF) → Okuo (public reg) → John (import) → John (staff) → Nash (routes) → John (merge)

---

## Workload Summary

| Dev | Phase 1 Focus | Phase 2 Focus | Est. Hours |
|-----|--------------|--------------|------------|
| **John** | Schema migration, Socket.IO, route wiring, code review | QR service, import service, upload middleware, staff management, integration review | ~50h |
| **Francis** | Password reset (forgot/reset), email service setup | Email templates (5), notification service, email wiring + tests | ~48h |
| **Okuo** | Event publish, cancel, slug, status filter + tests | Public registration (free + paid), public event view + tests | ~48h |
| **Emmanuel** | TicketType CRUD module + tests | Ticket routes (view, list, export), PDF ticket download + tests | ~48h |
| **Nash** | Swagger annotations, definition file updates | File parsers (4 formats), import routes, Swagger Phase 2 | ~48h |

---

## Branch Strategy

```
dev (default)
├── feature/schema-migration     ← John (Day 1)
├── feature/auth-password-reset  ← Francis (Day 1-2)
├── feature/event-publish-cancel ← Okuo (Day 1-2)
├── feature/tickettype-crud      ← Emmanuel (Day 1-2)
├── feature/swagger-phase1       ← Nash (Day 1-2)
├── feature/qr-service           ← John (Day 4)
├── feature/email-service        ← Francis (Day 4-5)
├── feature/public-registration  ← Okuo (Day 4-5)
├── feature/ticket-routes-pdf    ← Emmanuel (Day 4-5)
├── feature/file-parsers         ← Nash (Day 4)
├── feature/import-service       ← John (Day 5)
├── feature/staff-management     ← John (Day 6)
└── feature/socket-integration   ← Nash (Day 6)
```

Each dev creates a feature branch from `dev`, implements, opens a PR → John reviews → merge to `dev`.
