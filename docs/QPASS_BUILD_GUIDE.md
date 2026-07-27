# QPass Backend Build Guide

> Developer-facing step-by-step plan. Each task lists exact files to create/edit, what goes in them, and dependencies. Follow in order within each phase.

---

## Existing Foundations (Already Built - Do Not Modify)

These files are production-quality and should be treated as stable:

| File | Purpose |
|------|---------|
| `src/app.js` | Express app (helmet, CORS, rate-limit, JSON, error handler) |
| `src/server.js` | HTTP server (Prisma, Redis, graceful shutdown) - needs Socket.IO attachment in Phase 1 |
| `src/config/*` (7 files) | env.js, constants.js, system_messages.js, logger.js, redis.js, swagger.js, index.js |
| `src/database/index.js` | Prisma client singleton |
| `src/database/schema.prisma` | Base schema (10 models, 9 enums) - needs extension in Phase 1 |
| `src/middlewares/logging.middleware.js` | pino-http |
| `src/middlewares/rate-limit.middleware.js` | globalLimiter + authLimiter |
| `src/middlewares/rbac.middleware.js` | requireAuth + requireRole |
| `src/utils/error.js` | AppError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError, ValidationError |
| `src/utils/response.js` | success(), created(), noContent() |
| `src/utils/crypto.js` | hashToken() - SHA-256 |
| `src/modules/checkins/*` | Full QR scan implementation (reference pattern for all modules) |
| `src/routes/health.js` | Health check endpoint |
| `src/routes/index.js` | Root router (/health, /api/v1, /api-docs) |
| `Dockerfile`, `docker-compose.yml` | Multi-stage build, Postgres 15 + Redis 7 |

---

## Module Pattern (Reference: `src/modules/checkins/`)

Every module follows this exact structure. Use `checkins/` as the template:

```
src/modules/<module>/
├── <module>.controller.js   # try/catch, call service, return success(), next(err) on error
├── <module>.service.js      # Business logic, prisma queries, throw AppError subclasses
├── <module>.routes.js       # Router(), map HTTP methods to controller functions
└── <module>.schema.js       # Zod objects for body, params, query
```

**Controller pattern:**
```js
import * as service from "./<module>.service.js";
import { success } from "../../utils/response.js";

export async function handler(req, res, next) {
  try {
    const result = await service.doSomething(req.body, req.params, req.user.id);
    return success(res, result, "Message from system_messages");
  } catch (err) {
    next(err);
  }
}
```

**Route pattern:**
```js
import { Router } from "express";
import { validate } from "../../utils/validators.js";
import { requireAuth } from "../../middlewares/rbac.middleware.js";
import * as controller from "./<module>.controller.js";
import { schema } from "./<module>.schema.js";

const router = Router();
router.post("/", requireAuth, validate(schema.create), controller.handler);
export default router;
```

---

# Phase 1: Foundation (Days 1–3)

**Goal:** Auth, Event CRUD, TicketType CRUD, routes wired, Socket.IO initialized.

## Step 1.1 - Schema Migration

**File:** `src/database/schema.prisma`

Add to existing schema:

**New enums:**
```prisma
enum RegistrationMode { PUBLIC_LINK  CLOSED_IMPORT  HYBRID }
enum RegistrationSource { IMPORT  PUBLIC_LINK }
```

**User - add fields:**
```prisma
phone           String?
emailVerifiedAt DateTime?      @map("email_verified_at")
lastLoginAt     DateTime?      @map("last_login_at")
```

**Event - add fields + relations:**
```prisma
slug                    String           @unique
registrationMode        RegistrationMode @default(PUBLIC_LINK)
isPaid                  Boolean          @default(false)
capacity                Int?
currency                String           @default("NGN")
registrationOpensAt     DateTime?        @map("registration_opens_at")
registrationClosesAt    DateTime?        @map("registration_closes_at")
publishedAt             DateTime?        @map("published_at")
ticketTypes             TicketType[]
importBatches           ImportBatch[]
```
Add `@@index([slug])` to Event.

**Registration - add fields:**
```prisma
phone            String?
ticketTypeId     String?            @map("ticket_type_id")
paymentStatus    PaymentStatus      @default(PENDING)
source           RegistrationSource @default(PUBLIC_LINK)
confirmationCode String?            @unique @map("confirmation_code")
metadata         Json?
ticketType       TicketType?        @relation(fields: [ticketTypeId], references: [id])
```

**Payment - add fields:**
```prisma
registrationId String?  @unique @map("registration_id")
gateway        String   @default("PAYSTACK")
metadata       Json?
verifiedAt     DateTime? @map("verified_at")
registration   Registration? @relation(fields: [registrationId], references: [id])
```

**Notification - add fields:**
```prisma
userId            String?  @map("user_id")
eventId           String?  @map("event_id")
registrationId    String?  @map("registration_id")
providerMessageId String?  @map("provider_message_id")
failureReason     String?  @map("failure_reason")
```

**AuditLog - make actorId nullable:**
```prisma
actorId String?  @map("actor_id")  // was: String (required)
```
Remove the `actor User @relation(...)` line - make the relation optional:
```prisma
actor User? @relation(fields: [actorId], references: [id])
```

**New models:**
```prisma
model TicketType {
  id            String   @id @default(uuid())
  eventId       String   @map("event_id")
  name          String
  description   String?
  price         Int      @default(0)
  capacity      Int?
  quantitySold  Int      @default(0) @map("quantity_sold")
  active        Boolean  @default(true)
  sortOrder     Int      @default(0) @map("sort_order")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt      @map("updated_at")
  event         Event    @relation(fields: [eventId], references: [id])
  registrations Registration[]
  @@index([eventId])
  @@map("ticket_types")
}

model ImportBatch {
  id               String    @id @default(uuid())
  eventId          String    @map("event_id")
  uploadedById     String    @map("uploaded_by_id")
  originalFilename String    @map("original_filename")
  fileType         String    @map("file_type")
  totalRows        Int       @default(0)  @map("total_rows")
  successRows      Int       @default(0)  @map("success_rows")
  failedRows       Int       @default(0)  @map("failed_rows")
  status           String    @default("PROCESSING")
  errorReport      Json?     @map("error_report")
  createdAt        DateTime  @default(now())  @map("created_at")
  completedAt      DateTime? @map("completed_at")
  event            Event     @relation(fields: [eventId], references: [id])
  uploadedBy       User      @relation(fields: [uploadedById], references: [id])
  @@index([eventId])
  @@map("import_batches")
}
```

**After editing:** Run `npm run migrate` to generate migration.

---

## Step 1.2 - Validate Middleware

**File:** `src/utils/validators.js` (currently empty)

```js
import { systemMessages } from "../config/index.js";

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      return res.status(422).json({
        status: "error",
        message: systemMessages.ERROR.GENERAL.VALIDATION_ERROR,
        errors,
      });
    }
    req.validated = result.data;
    next();
();
  };
}
```

---

## Step 1.3 - Auth Module

### 1.3a - Auth Schema

**File:** `src/modules/auth/auth.schema.js`

Define Zod schemas:
- `registerSchema` - body: name (string, min 2), email (email), password (min 8)
- `loginSchema` - body: email, password
- `refreshSchema` - body: refreshToken (string)
- `logoutSchema` - body: refreshToken (string)
- `forgotPasswordSchema` - body: email
- `resetPasswordSchema` - body: token (string), newPassword (min 8)

Each exported as `{ body, query, params }` shape for the validate middleware.

### 1.3b - Auth Service

**File:** `src/modules/auth/auth.service.js`

Implement:
- `register(data)` - check email uniqueness (throw ConflictError), bcrypt hash (12 rounds), create User (role=ATTENDEE), generate JWT access + refresh tokens, return `{ user, accessToken, refreshToken }`
- `login(data)` - find by email (throw UnauthorizedError if not found), bcrypt compare (throw UnauthorizedError if mismatch), update lastLoginAt, generate tokens, return `{ user, accessToken, refreshToken }`
- `refresh(refreshToken)` - verify JWT with refresh secret, check Redis blacklist (throw if blacklisted), blacklist old token, issue new pair, return `{ accessToken, refreshToken }`
- `logout(refreshToken)` - verify JWT, add to Redis blacklist with 7d TTL
- `forgotPassword(email)` - find user, generate reset token (crypto.randomBytes), hash it, store in Redis with 1h TTL, send email (non-blocking)
- `resetPassword(token, newPassword)` - lookup hash in Redis, find user, bcrypt new password, delete Redis key

**JWT signing:** Use `jsonwebtoken` library. Access token payload: `{ id, email, role }`. Sign with `JWT_SECRET`, expire `JWT_EXPIRES_IN`. Refresh token: sign with `JWT_REFRESH_SECRET`, expire `JWT_REFRESH_EXPIRES_IN`.

### 1.3c - Auth Middleware

**File:** `src/modules/auth/auth.middleware.js`

Implement `authenticateUser`:
- Extract `Authorization: Bearer <token>` header
- Verify with `JWT_SECRET`
- Find user by decoded.id
- Attach `req.user = { id, email, role, name }`
- Call `next()` on success, `next(UnauthorizedError)` on failure

### 1.3d - Auth Controller

**File:** `src/modules/auth/auth.controller.js`

6 handlers following the checkins controller pattern: register, login, refresh, logout, forgotPassword, resetPassword.

### 1.3e - Auth Routes

**File:** `src/modules/auth/auth.routes.js`

```
POST /register    → authLimiter → validate(schema) → controller.register
POST /login       → authLimiter → validate(schema) → controller.login
POST /refresh     → validate(schema) → controller.refresh
POST /logout      → authenticateUser → validate(schema) → controller.logout
POST /password/forgot → authLimiter → validate(schema) → controller.forgotPassword
POST /password/reset  → validate(schema) → controller.resetPassword
```

---

## Step 1.4 - Event Module

### 1.4a - Event Schema

**File:** `src/modules/events/events.schema.js`

Schemas:
- `createEvent` - body: title (string, min 1), description?, venue?, startTime (datetime), endTime (datetime, after startTime), registrationMode (enum), isPaid?, capacity? (int, positive), currency?
- `updateEvent` - body: all fields optional
- `listEvents` - query: page?, limit?, status? (enum)
- `eventParams` - params: eventId (uuid)

### 1.4b - Event Service

**File:** `src/modules/events/events.service.js`

Implement:
- `createEvent(data, ownerId)` - create with status=DRAFT, return event
- `listEvents(ownerId, query)` - paginated, filter by status, include ticketTypes count
- `getEvent(eventId, userId)` - find by id, verify ownership (throw ForbiddenError), include relations
- `updateEvent(eventId, userId, data)` - verify ownership, only DRAFT events editable, update
- `publishEvent(eventId, userId)` - verify ownership, status must be DRAFT, generate slug (`slugify(title) + "-" + uuid.slice(0,6)`), set publishedAt, status→PUBLISHED
- `cancelEvent(eventId, userId)` - verify ownership, set status→CANCELLED

**Slug generation:** Use a helper in `utils/id-generator.js`:
```js
import { customAlphabet } from "nanoid"; // or use uuid
export function generateSlug(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${slug}-${suffix}`;
}
```

### 1.4c - Event Controller

**File:** `src/modules/events/events.controller.js`

6 handlers: createEvent, listEvents, getEvent, updateEvent, publishEvent, cancelEvent.

### 1.4d - Event Routes

**File:** `src/modules/events/events.routes.js`

```
POST   /                   → authenticateUser → requireRole(ORGANIZER) → validate → controller.create
GET    /                   → authenticateUser → requireRole(ORGANIZER, ADMIN) → validate → controller.list
GET    /:eventId           → authenticateUser → validate → controller.get
PATCH  /:eventId           → authenticateUser → validate → controller.update
POST   /:eventId/publish   → authenticateUser → validate → controller.publish
POST   /:eventId/cancel    → authenticateUser → validate → controller.cancel
```

### 1.4e - Ownership Middleware

**File:** `src/middlewares/ownership.middleware.js` (new file)

```js
export function requireOwnership(getOwnerId) {
  return async (req, res, next) => {
    const ownerId = await getOwnerId(req.params.eventId);
    if (ownerId !== req.user.id && req.user.role !== "ADMIN") {
      return next(new ForbiddenError(systemMessages.ERROR.EVENT.UNAUTHORIZED));
    }
    next();
  };
}
```

---

## Step 1.5 - TicketType Module

### 1.5a - TicketType Schema

**File:** `src/modules/tickets/tickets.schema.js`

Schemas:
- `createTicketType` - body: name (string), description?, price (int, min 0), capacity? (int, positive)
- `updateTicketType` - body: all optional
- `ticketTypeParams` - params: eventId, id

### 1.5b - TicketType Service

**File:** `src/modules/tickets/tickets.service.js`

Implement:
- `createTicketType(eventId, userId, data)` - verify event ownership, create TicketType
- `listTicketTypes(eventId, userId)` - verify ownership, return all for event
- `updateTicketType(eventId, ticketTypeId, userId, data)` - verify ownership, update
- `deleteTicketType(eventId, ticketTypeId, userId)` - verify ownership, check no registrations linked (throw ConflictError if registrations exist), delete

### 1.5c - TicketType Controller

**File:** `src/modules/tickets/tickets.controller.js`

4 handlers: create, list, update, delete.

### 1.5d - TicketType Routes

**File:** `src/modules/tickets/tickets.routes.js`

```
POST   /:eventId/ticket-types         → authenticateUser → validate → controller.create
GET    /:eventId/ticket-types         → authenticateUser → validate → controller.list
PATCH  /:eventId/ticket-types/:id     → authenticateUser → validate → controller.update
DELETE /:eventId/ticket-types/:id     → authenticateUser → validate → controller.delete
```

---

## Step 1.6 - Route Wiring

**File:** `src/routes/v1.js`

```js
import { Router } from "express";
import { authenticateUser } from "../modules/auth/auth.middleware.js";
import authRoutes from "../modules/auth/auth.routes.js";
import eventRoutes from "../modules/events/events.routes.js";
import ticketRoutes from "../modules/tickets/tickets.routes.js";
import checkinRoutes from "../modules/checkins/checkins.routes.js";

const router = Router();

// Public routes
router.use("/auth", authRoutes);

// Protected routes - authenticateUser applied at module level
router.use("/events", authenticateUser, eventRoutes);
router.use("/events", authenticateUser, ticketRoutes);
router.use("/checkins", authenticateUser, checkinRoutes);

// Public registration routes (Phase 2)
// router.use("/public", publicRoutes);

// Payments (Phase 3)
// router.use("/payments", paymentRoutes);

// Reports (Phase 4)
// router.use("/events", authenticateUser, reportRoutes);

export default router;
```

---

## Step 1.7 - Socket.IO Initialization

**File:** `src/realtime/socket.js`

```js
import { Server } from "socket.io";

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: process.env.SOCKET_CORS_ORIGIN || "*" },
  });
  return io;
}

export function getIO() {
  return io;
}
```

**File:** `src/server.js` - add Socket.IO:

```js
import { initSocket } from "./realtime/socket.js";

// After http.createServer(app):
const server = http.createServer(app);
const io = initSocket(server);  // ADD THIS

// In listen callback, after Redis:
// io is now available globally via getIO()
```

**File:** `src/realtime/rooms.js`

```js
export function joinDashboardRoom(io, eventId) {
  return `event:${eventId}:dashboard`;
}

export function emitToDashboard(io, eventId, event, data) {
  io.to(`event:${eventId}:dashboard`).emit(event, data);
}
```

---

## Phase 1 Exit Checklist

- [ ] Schema migrated with new enums, fields, TicketType, ImportBatch
- [ ] `npm run migrate` succeeds
- [ ] Register → login → refresh → logout works
- [ ] Password forgot → email sent → reset → login works
- [ ] Create event (DRAFT), list, get, edit, publish (slug), cancel all work
- [ ] TicketType CRUD (create, list, edit, delete) works
- [ ] All routes registered in `v1.js` and accessible via `/api/v1/*`
- [ ] Swagger shows all Phase 1 endpoints at `/api-docs`
- [ ] Socket.IO initializes without errors

---

# Phase 2: Registration & QR (Days 4–7)

**Goal:** Both registration flows, QR generation, email delivery, file import, ticket PDF, staff management.

## Step 2.1 - QR Service

**File:** `src/modules/tickets/qr.service.js` (currently empty)

Implement:
- `generateQRToken(registrationId, expiresAt)` - `crypto.randomBytes(32).toString("hex")` → hashToken → create QrToken → return raw token
- `generateQRImage(token)` - `QRCode.toDataURL(token, { width: 300 })` → base64 data URL
- `verifyQRToken(token, eventId)` - hash → lookup QrToken → validate expiry, event match, revocation → return registration or null

---

## Step 2.2 - ID Generator

**File:** `src/utils/id-generator.js` (currently empty)

Implement:
- `generateSlug(title)` - kebab-case + 6-char hex suffix
- `generateConfirmationCode()` - 8-char alphanumeric uppercase

---

## Step 2.3 - Public Registration Module

### 2.3a - Public Service

**File:** `src/modules/registrations/public.service.js`

Implement:
- `getPublicEvent(slug)` - find event by slug (must be PUBLISHED), include ticketTypes (active only), return event details
- `registerForEvent(slug, data)` - find event, validate ticketType exists, check capacity, create Registration + TicketCode + QrToken (if free), return `{ registration, ticket, paymentUrl? }`
- `handlePaidRegistration(event, ticketType, data)` - create Registration (PENDING) + Payment (PENDING), call Paystack initialize, return paymentUrl

### 2.3b - Public Routes

**File:** `src/modules/registrations/public.routes.js`

```
GET  /public/events/:slug          → controller.getPublicEvent
POST /public/events/:slug/register → validate → controller.register
```

---

## Step 2.4 - Attendee Import Service

**File:** `src/modules/registrations/import.service.js`

Implement:
- `importAttendees(eventId, userId, file)` - detect file type by extension, parse based on type (see parsers below), validate rows, create Registration + TicketCode + QrToken per valid row, track ImportBatch, return summary
- `getImportBatch(eventId, batchId)` - return batch details + errorReport

**File parsers (can be separate utils or inline):**

| Format | Implementation |
|--------|---------------|
| CSV | `import { parse } from "csv-parse/sync";` → `parse(file.buffer, { columns: true, skip_empty_lines: true })` |
| XLSX | `import * as XLSX from "xlsx";` → `XLSX.read(file.buffer, { type: "buffer" })` → sheet_to_json |
| PDF | `import pdfParse from "pdf-parse";` → `pdfParse(file.buffer)` → extract text → split by lines → detect email/phone patterns → structure rows |
| DOCX | `import mammoth from "mammoth";` → `mammoth.convertToHtml({ buffer: file.buffer })` → parse `<table>` → extract `<tr>` rows |

**Row validation per row:**
- `name` required
- `email` or `phone` at least one required
- `ticketType` if provided must match an existing TicketType for the event
- No duplicate email/phone within the same event
- Capacity not exceeded

**Upload middleware:** Add Multer to import routes:
```js
import multer from "multer";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [".csv", ".xlsx", ".pdf", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});
```

> **Note:** `multer` needs to be installed: `npm install multer`

---

## Step 2.5 - Registration Module

### 2.5a - Registration Service

**File:** `src/modules/registrations/registrations.service.js`

Implement:
- `listRegistrations(eventId, userId, query)` - paginated, verify event ownership
- `getRegistration(eventId, registrationId, userId)` - verify ownership
- `exportRegistrations(eventId, userId)` - generate CSV string from registrations

### 2.5b - Registration Routes

**File:** `src/modules/registrations/registrations.routes.js`

```
GET  /:eventId/registrations              → authenticateUser → controller.list
GET  /:eventId/registrations/:regId       → authenticateUser → controller.get
POST /:eventId/registrations/export       → authenticateUser → controller.export
POST /:eventId/import                     → authenticateUser → upload.single("file") → controller.import
GET  /:eventId/import/:batchId            → authenticateUser → controller.getImportBatch
GET  /:eventId/import-template            → authenticateUser → controller.downloadTemplate
```

---

## Step 2.6 - Ticket View + PDF Download

### 2.6a - Ticket Service

**File:** `src/modules/tickets/tickets.service.js`

Implement:
- `getTicket(ticketId, userId)` - find TicketCode by id, verify user is attendee or event owner, include registration + qrToken
- `listEventTickets(eventId, userId, query)` - paginated, verify ownership
- `exportTickets(eventId, userId)` - CSV export

### 2.6b - PDF Ticket Service

**File:** `src/modules/pdf/ticket-pdf.service.js`

Implement `generateTicketPDF(ticketData)`:
- Create PDFKit document
- Add QPass header
- Add event name, date, venue
- Add attendee name, email
- Add ticket type
- Generate QR image via `QRCode.toDataURL(token)` → embed as PNG
- Add confirmation code
- Add check-in instructions
- Return PDF buffer

### 2.6c - Ticket Routes

**File:** `src/modules/tickets/tickets.routes.js` - extend existing file

Add to existing TicketType routes:
```
GET  /tickets/:ticketId             → controller.viewTicket
GET  /tickets/:ticketId/download    → controller.downloadPDF
GET  /:eventId/tickets              → authenticateUser → controller.listEventTickets
POST /:eventId/tickets/export       → authenticateUser → controller.exportTickets
```

---

## Step 2.7 - Email Service

**File:** `src/modules/notifications/email.service.js`

Implement:
- `sendEmail(to, template, data)` - create Notification (PENDING), render HTML template, send via Nodemailer, update Notification (SENT/FAILED)
- `sendRegistrationConfirmation(registration, event)` - template: registration-confirmed
- `sendQRCode(registration, event, rawToken)` - template: qr-generated
- `sendStaffInvitation(staffEmail, event, inviteToken)` - template: staff-invitation
- `sendPasswordReset(email, resetToken)` - template: password-reset

**File:** `src/integrations/email/smtp.js`

```js
import nodemailer from "nodemailer";
import { getConfig } from "../config/index.js";

const config = getConfig();
const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
});
export default transporter;
```

> **Note:** Add SMTP env vars to `src/config/env.js`:
> ```js
> SMTP_HOST: z.string().default("smtp.gmail.com"),
> SMTP_PORT: z.coerce.number().default(587),
> SMTP_SECURE: z.enum(["true","false"]).default("false").transform(v => v === "true"),
> SMTP_USER: z.string().default(""),
> SMTP_PASS: z.string().default(""),
> SMTP_FROM: z.string().default("QPass <noreply@qpass.com>"),
> FRONTEND_BASE_URL: z.string().default("http://localhost:3001"),
> ```

**Templates:** Create HTML files in `src/modules/notifications/templates/`:
- `registration-confirmed.html`
- `qr-generated.html`
- `payment-success.html` (Phase 3)
- `staff-invitation.html`
- `password-reset.html`

Use simple Handlebars-style placeholders (`{{eventTitle}}`, `{{attendeeName}}`, etc.) and replace in the email service.

---

## Step 2.8 - Staff Module

### 2.8a - Staff Service

**File:** `src/modules/staff/staff.service.js`

Implement:
- `assignStaff(eventId, userId, data)` - verify event ownership, check if staff email exists as User, if not create pending User (role=STAFF, status=INACTIVE), create EventStaffAssignment, send invitation email
- `listStaff(eventId, userId)` - verify ownership, return all assignments with user info
- `removeStaff(eventId, staffId, userId)` - verify ownership, delete EventStaffAssignment

### 2.8b - Staff Schema

**File:** `src/modules/staff/staff.schema.js`

- `assignStaff` - body: email (email), permissionScope? (string)

### 2.8c - Staff Routes

**File:** `src/modules/staff/staff.routes.js`

```
POST   /:eventId/staff           → authenticateUser → validate → controller.assign
GET    /:eventId/staff           → authenticateUser → controller.list
DELETE /:eventId/staff/:staffId  → authenticateUser → controller.remove
```

---

## Phase 2 Exit Checklist

- [ ] Public event view (`GET /public/events/:slug`) returns event + ticket types
- [ ] Free registration → Registration CONFIRMED + TicketCode + QrToken + email sent
- [ ] Paid registration → Registration PENDING + Payment PENDING + Paystack URL returned
- [ ] CSV/XLSX import works with row validation and error reporting
- [ ] PDF import extracts tables, DOCX import extracts tables
- [ ] ImportBatch tracking with success/fail counts
- [ ] QR token generated per registration (SHA-256 hash, raw token delivered)
- [ ] Ticket view endpoint returns ticket + QR
- [ ] PDF download generates correct PDF with QR, event details, attendee info
- [ ] Email sends for: registration, QR, staff invite, password reset
- [ ] Staff assignment creates pending user if needed + sends invite
- [ ] Staff list and removal work
- [ ] All routes wired in `v1.js`

---

# Phase 3: Payments & Check-in (Days 8–10)

**Goal:** Paystack integration, webhook processing, enhanced check-in with real-time.

## Step 3.1 - Paystack Integration

### 3.1a - Paystack Client

**File:** `src/integrations/paystack/client.js`

Implement:
- `initializeTransaction({ email, amount, callback_url, metadata })` - `POST https://api.paystack.co/transaction/initialize` with `Authorization: Bearer ${PAYSTACK_SECRET_KEY}`
- `verifyTransaction(reference)` - `GET https://api.paystack.co/transaction/verify/${reference}`

Use `axios`. Amount in naira.

### 3.1b - Paystack Webhook Verifier

**File:** `src/integrations/paystack/webhook.js`

```js
import crypto from "crypto";

export function verifyWebhookSignature(rawBody, signature, secret) {
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}
```

---

## Step 3.2 - Payment Module

### 3.2a - Payment Service

**File:** `src/modules/payments/payment.service.js`

Implement:
- `initializePayment(registrationId, userId)` - find registration + ticketType, create Payment (PENDING), call Paystack initialize, return `{ authorization_url, reference }`
- `verifyPayment(reference)` - call Paystack verify, if success: update Payment (SUCCESS, paidAt, verifiedAt), update Registration (CONFIRMED, paymentStatus: SUCCESS), create TicketCode + QrToken, send QR email, audit log, emit Socket.IO
- `getPaymentStatus(paymentId, userId)` - return payment details

### 3.2b - Webhook Handler

**File:** `src/modules/payments/webhook.handler.js`

Implement:
- `handleWebhook(rawBody, signature)` - verify signature, parse event, if `charge.success`: extract reference → call verifyPayment logic (idempotent: check payment status first)

**Critical:** Webhook must use `express.raw()` for the body, NOT `express.json()`. Add raw body capture in `app.js` or on the webhook route specifically:
```js
// In the webhook route, use raw body:
router.post("/webhook", express.raw({ type: "application/json" }), webhookHandler);
```

### 3.2c - Payment Routes

**File:** `src/modules/payments/payment.routes.js`

```
POST /payments/webhook              → express.raw() → controller.webhook
POST /payments/verify/:reference    → controller.verify
```

### 3.2d - Payment Controller

**File:** `src/modules/payments/payment.controller.js`

Handlers: webhook, verify.

---

## Step 3.3 - Enhanced Check-in

**File:** `src/modules/checkins/checkins.service.js` - modify existing

Enhancements to existing `scanQr`:
1. **Add staff authorization check** before QR validation:
   ```js
   const assignment = await prisma.eventStaffAssignment.findUnique({
     where: { eventId_userId: { eventId, userId: staffId } },
   });
   if (!assignment || !assignment.active) {
     return { result: "NOT_AUTHORIZED", message: "..." };
   }
   ```
2. **Add Socket.IO emission** after successful scan:
   ```js
   import { getIO } from "../../realtime/socket.js";
   const io = getIO();
   io.to(`event:${eventId}:dashboard`).emit("checkin:update", {
     result: "VALID",
     attendeeName: checkin.registration.attendeeName,
     totalCheckedIn: await prisma.checkIn.count({ where: { eventId } }),
     timestamp: new Date().toISOString(),
   });
   ```
3. **Expand scan results** to include: EXPIRED, WRONG_EVENT, REVOKED, NOT_AUTHORIZED (currently only VALID/DUPLICATE/INVALID)

**File:** `src/modules/checkins/checkins.routes.js` - add auth middleware:
```js
router.post("/:eventId/scan", authenticateUser, requireRole(STAFF, ORGANIZER), validate(scanQrSchema), controller.scanQr);
```

---

## Step 3.4 - Socket.IO Room Management

**File:** `src/realtime/socket.js` - enhance

Add JWT authentication on connection:
```js
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  socket.on("join:event", (eventId) => {
    socket.join(`event:${eventId}:dashboard`);
  });
  socket.on("leave:event", (eventId) => {
    socket.leave(`event:${eventId}:dashboard`);
  });
});
```

---

## Phase 3 Exit Checklist

- [ ] Paystack initialize returns `authorization_url`
- [ ] Webhook processes `charge.success` idempotently
- [ ] Manual verify endpoint works as fallback
- [ ] Payment → Registration → TicketCode → QR → email chain works
- [ ] Staff authorization check blocks non-assigned staff (403)
- [ ] All scan results work: VALID, DUPLICATE, INVALID, EXPIRED, WRONG_EVENT, REVOKED, NOT_AUTHORIZED
- [ ] Socket.IO emits `checkin:update` after each scan
- [ ] Dashboard receives real-time updates
- [ ] Webhook raw body handled correctly (not parsed by express.json)

---

# Phase 4: Reporting & Release (Days 11–14)

**Goal:** Dashboard stats, exports, seed script, tests, deployment.

## Step 4.1 - Dashboard Stats

**File:** `src/modules/reports/dashboard.service.js`

Implement `getDashboardStats(eventId, userId)`:
- Verify event ownership
- Return:
  ```js
  {
    totalRegistrations: await prisma.registration.count({ where: { eventId } }),
    totalCheckIns: await prisma.checkIn.count({ where: { eventId } }),
    noShows: totalRegistrations - totalCheckIns,
    capacityUtilization: event.capacity ? (totalRegistrations / event.capacity * 100) : null,
    ticketBreakdown: await prisma.ticketType.findMany({
      where: { eventId },
      select: { name: true, price: true, quantitySold: true, capacity: true },
    }),
    checkInsByHour: // group checkIns by hour for chart data
  }
  ```

**File:** `src/modules/reports/dashboard.routes.js`

```
GET /:eventId/dashboard → authenticateUser → controller.getDashboard
```

---

## Step 4.2 - CSV Export

**File:** `src/modules/reports/export.service.js`

Implement:
- `exportAttendanceCSV(eventId)` - query checkIns with registration info, format as CSV string
- `exportRegistrationsCSV(eventId)` - query registrations with ticketType, format as CSV

Use a simple CSV builder or `csv-stringify` library.

**File:** `src/modules/reports/export.routes.js`

```
GET /:eventId/exports/attendance     → authenticateUser → controller.exportAttendance
GET /:eventId/exports/registrations  → authenticateUser → controller.exportRegistrations
```

---

## Step 4.3 - Audit Log Queries

**File:** `src/modules/admin/audit.service.js`

Implement:
- `getAuditLogs(filters)` - query AuditLog with optional filters: action, entity, actorId, dateFrom, dateTo. Paginated.
- `createAuditLog(data)` - helper used by all modules: `{ actorId, action, entity, entityId, beforeSnapshot, afterSnapshot }`

---

## Step 4.4 - Seed Script

**File:** `src/database/seed.js` (currently empty placeholder)

Implement:
```js
async function main() {
  // 1. Create admin user
  // 2. Create organizer user
  // 3. Create 2 sample events (one DRAFT, one PUBLISHED)
  // 4. Create ticket types for each event
  // 5. Create sample registrations + ticket codes
  // 6. Log summary
}
```

---

## Step 4.5 - Swagger Annotations

Add JSDoc-style Swagger annotations to all route files. Reference `docs/swagger-definition.json` for the base definition.

Key annotations per route:
```js
/**
 * @swagger
 * /events:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startTime, endTime]
 *             properties:
 *               title: { type: string }
 *               ...
 *     responses:
 *       201: { description: Event created }
 */
```

---

## Step 4.6 - Tests

### Unit Tests

| File | Tests |
|------|-------|
| `tests/unit/auth.service.test.js` | register (success, duplicate email), login (success, wrong password), refresh (valid, blacklisted), logout |
| `tests/unit/qr.service.test.js` | generateQRToken (uniqueness), verifyQRToken (valid, expired, wrong event, revoked) |
| `tests/unit/import.service.test.js` | CSV parsing, XLSX parsing, PDF parsing, DOCX parsing, row validation, duplicate detection |
| `tests/unit/paystack.service.test.js` | webhook signature verification, idempotent processing, amount mismatch detection |
| `tests/unit/ticket-pdf.service.test.js` | PDF generation, QR embedding |

### Integration Tests

| File | Scenarios |
|------|-----------|
| `tests/integration/auth.test.js` | register → login → refresh → logout → password reset |
| `tests/integration/events.test.js` | create → edit → publish → list → cancel → unauthorized |
| `tests/integration/registrations.test.js` | free reg → paid reg → capacity limit → duplicate → CSV import |
| `tests/integration/checkins.test.js` | valid → duplicate → wrong event → expired → unauthorized → undo |
| `tests/integration/payments.test.js` | initialize → webhook → idempotent → invalid signature |

**Test setup (`tests/setup.js`):**
```js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function resetDatabase() {
  await prisma.checkIn.deleteMany();
  await prisma.qrToken.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.ticketCode.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.eventStaffAssignment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
}

export { prisma };
```

---

## Step 4.7 - Deployment Config

### Render.com Settings

| Setting | Value |
|---------|-------|
| Build command | `npm install && npx prisma migrate deploy && npx prisma generate` |
| Start command | `node src/server.js` |
| Region | Frankfurt (EU) |

### Environment Variables Checklist

```
NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGIN, SWAGGER_ENABLED,
DATABASE_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DATABASE,
JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN,
PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, PAYSTACK_WEBHOOK_SECRET,
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM,
SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE, FRONTEND_BASE_URL, SOCKET_CORS_ORIGIN
```

---

## Step 4.8 - Security Pass

Final checklist before release:

- [ ] All endpoints have Zod validation
- [ ] All protected endpoints have `authenticateUser`
- [ ] All role-restricted endpoints have `requireRole`
- [ ] Event endpoints verify ownership
- [ ] `role` field stripped from registration input
- [ ] Refresh token checked against Redis blacklist before rotation
- [ ] Access token NOT checked against blacklist
- [ ] Auth routes have `authLimiter`
- [ ] Webhook uses raw body for HMAC verification
- [ ] Payment amount verified from TicketType, not client
- [ ] Error messages generic in production (no stack traces)
- [ ] No hardcoded messages - all from `system_messages.js`
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] `GET /health` returns 200

---

## Phase 4 Exit Checklist

- [ ] Dashboard returns correct stats (registrations, check-ins, no-shows, capacity, ticket breakdown)
- [ ] Attendance CSV export downloads and opens correctly
- [ ] Registration CSV export downloads and opens correctly
- [ ] Audit log queries work with filters
- [ ] Seed script creates admin, organizer, sample events, registrations
- [ ] Swagger docs show all endpoints
- [ ] Unit tests pass for: auth, QR, import, Paystack, PDF
- [ ] Integration tests pass for: auth, events, registrations, check-ins, payments
- [ ] `npm run lint` clean
- [ ] Deployed to Render, health check returns 200
- [ ] Security pass complete

---

*QPass Backend Build Guide | July 2026 | Crosstrack Group 13*
