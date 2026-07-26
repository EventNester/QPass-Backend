# QPass API Reference

Base URL: `http://localhost:3000`

All responses use the envelope:

```json
{ "status": "success" | "error", "message": "...", "data": { ... } }
```

---

## Authentication

Protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Tokens are obtained from register/login. Access tokens expire in 15 minutes. Refresh tokens are long-lived and used to rotate access tokens without re-authenticating. Refresh tokens are blacklisted on logout.

---

## Roles

| Role | Access Level |
|------|-------------|
| `ATTENDEE` | Registers for events, views own tickets |
| `STAFF` | Scans QR codes at event check-in |
| `ORGANIZER` | Creates and manages own events, views reports |
| `ADMIN` | Full system access across all events |

Organizers can only access their own resources unless they have the `ADMIN` role.

---

## Rate Limiting

- **Global:** 100 requests / 15 min per IP (applied to all endpoints)
- **Auth endpoints:** 5 requests / 15 min per IP (register, login, password reset)

Rate-limited requests receive a `429 Too Many Requests` response.

---

## Error Format

| HTTP Status | Meaning |
|:-----------:|---------|
| 400 | Bad request / missing fields |
| 401 | Missing or invalid access token |
| 403 | Authenticated but insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email, duplicate check-in) |
| 422 | Validation failed (Zod schema errors) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Pagination

List endpoints accept `page` and `limit` query parameters (defaults: `page=1`, `limit=20`).

Response includes:

```json
{
  "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
}
```

---

## Endpoints

### Health

---

#### `GET /health`

Check database and Redis connectivity.

**Auth:** No

```json
// 200
{ "status": "healthy", "timestamp": "...", "checks": { "database": "ok", "redis": "ok" } }

// 503 (degraded)
{ "status": "degraded", "checks": { "database": "unavailable", "redis": "ok" } }
```

### Auth

---

#### `POST /api/v1/auth/register`

Create a new user account. Default role is `ATTENDEE`.

**Auth:** No | **Rate Limit:** 5 / 15 min

**Body:**

```json
{ "name": "John Doe", "email": "john@example.com", "password": "securePassword123" }
```

**Response `201`:**

```json
{ "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "ATTENDEE" }, "accessToken": "...", "refreshToken": "..." }
```

---

#### `POST /api/v1/auth/login`

Authenticate and receive tokens.

**Auth:** No | **Rate Limit:** 5 / 15 min

**Body:**

```json
{ "email": "john@example.com", "password": "securePassword123" }
```

**Response `200`:**

```json
{ "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "ATTENDEE" }, "accessToken": "...", "refreshToken": "..." }
```

---

#### `POST /api/v1/auth/refresh`

Exchange a valid refresh token for a new access token. The old refresh token is blacklisted.

**Auth:** Valid refresh token

**Body:**

```json
{ "refreshToken": "..." }
```

**Response `200`:**

```json
{ "accessToken": "..." }
```

---

#### `POST /api/v1/auth/logout`

Blacklist the current refresh token.

**Auth:** Authenticated

**Body:**

```json
{ "refreshToken": "..." }
```

**Response `200`:** `{ "message": "Logged out successfully" }`

---

#### `POST /api/v1/auth/password/forgot`

Send a password reset email. Returns a generic message regardless of whether the email exists.

**Auth:** No | **Rate Limit:** 5 / 15 min

**Body:** `{ "email": "john@example.com" }`

**Response `200`:** `{ "message": "If an account exists with that email, a reset link has been sent" }`

---

#### `POST /api/v1/auth/password/reset`

Reset password using the token from the reset email.

**Auth:** No

**Body:** `{ "token": "...", "newPassword": "newSecurePassword123" }`

**Response `200`:** `{ "message": "Password reset successful" }`

---

### Events

---

#### `POST /api/v1/events`

Create a new event. Starts in `DRAFT` status.

**Auth:** ORGANIZER

**Body:**

```json
{ "title": "Tech Conference 2026", "description": "...", "venue": "Lagos Convention Center", "startTime": "2026-09-15T09:00:00Z", "endTime": "2026-09-15T17:00:00Z", "maxCapacity": 500 }
```

**Response `201`:** `{ "event": { "id": "...", "title": "...", "status": "DRAFT", "ownerId": "..." } }`

---

#### `GET /api/v1/events`

List events for the authenticated user. Admins see all events.

**Auth:** ORGANIZER / ADMIN

**Query:** `?page=1&limit=20&status=PUBLISHED`

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `status` | string | Filter by `EventStatus` |

**Response `200`:** `{ "events": [...], "pagination": { ... } }`

---

#### `GET /api/v1/events/:eventId`

Get full event details including ticket types.

**Auth:** Owner (ORGANIZER) / ADMIN

**Response `200`:** `{ "event": { "id", "title", "description", "venue", "startTime", "endTime", "status", "slug", "ownerId", "ticketTypes": [...] } }`

---

#### `PATCH /api/v1/events/:eventId`

Update event details. Only allowed while event is in `DRAFT` status.

**Auth:** Owner (ORGANIZER)

**Body (all optional):** `{ "title", "description", "venue", "startTime", "endTime", "maxCapacity" }`

**Response `200`:** `{ "event": { ... } }`

---

#### `POST /api/v1/events/:eventId/publish`

Publish the event. Generates a unique public slug for registration.

**Auth:** Owner (ORGANIZER)

**Response `200`:** `{ "event": { "id": "...", "status": "PUBLISHED", "slug": "tech-conference-2026-a1b2c3" } }`

---

#### `POST /api/v1/events/:eventId/cancel`

Cancel the event.

**Auth:** Owner (ORGANIZER)

**Response `200`:** `{ "event": { "id": "...", "status": "CANCELLED" } }`

---

### Ticket Types

---

#### `POST /api/v1/events/:eventId/ticket-types`

Create a ticket type for an event.

**Auth:** Owner (ORGANIZER)

**Body:** `{ "name": "General Admission", "description": "...", "price": 5000, "capacity": 200 }`

**Response `201`:** `{ "ticketType": { "id", "name", "price", "capacity" } }`

---

#### `GET /api/v1/events/:eventId/ticket-types`

List all ticket types with sold counts.

**Auth:** Owner (ORGANIZER)

**Response `200`:** `{ "ticketTypes": [{ "id", "name", "price", "capacity", "soldCount" }] }`

---

#### `PATCH /api/v1/events/:eventId/ticket-types/:id`

Update a ticket type. Only allowed if no registrations exist for this type.

**Auth:** Owner (ORGANIZER)

**Body (all optional):** `{ "name", "description", "price", "capacity" }`

**Response `200`:** `{ "ticketType": { ... } }`

---

#### `DELETE /api/v1/events/:eventId/ticket-types/:id`

Delete a ticket type. Only allowed if no registrations exist.

**Auth:** Owner (ORGANIZER)

**Response:** `204 No Content`

---

### Attendee Import

---

#### `POST /api/v1/events/:eventId/import`

Upload a CSV, XLSX, PDF, or DOCX file containing attendee data. Returns per-row validation errors for failed rows.

**Auth:** Owner (ORGANIZER) | **Content-Type:** `multipart/form-data` | **Max size:** 5MB

| Field | Type | Constraints |
|-------|------|-------------|
| `file` | File | `.csv`, `.xlsx`, `.pdf`, `.docx` only |

**Response `200`:**

```json
{ "batchId": "...", "totalRows": 100, "successRows": 95, "failedRows": 5, "errors": [{ "row": 12, "email": "bad@@", "reason": "Invalid email format" }] }
```

---

#### `GET /api/v1/events/:eventId/import/:batchId`

Get import batch status and per-row errors.

**Auth:** Owner (ORGANIZER)

**Response `200`:** `{ "batch": { "id", "totalRows", "successRows", "failedRows", "status", "errors": [...] } }`

---

#### `GET /api/v1/events/:eventId/import-template`

Download a CSV template with the correct column headers for attendee import.

**Auth:** Owner (ORGANIZER)

**Response:** CSV file download (`Content-Type: text/csv`)

---

### Public Registration

---

#### `GET /api/v1/public/events/:slug`

Get public event details and available ticket types. No authentication required.

**Auth:** No

**Response `200`:**

```json
{ "event": { "id", "title", "description", "venue", "startTime", "endTime", "slug" }, "ticketTypes": [{ "id", "name", "price", "capacity", "availableCount" }] }
```

---

#### `POST /api/v1/public/events/:slug/register`

Register for an event. Free events are confirmed instantly. Paid events return a Paystack payment URL.

**Auth:** No

**Body:** `{ "name": "Jane Doe", "email": "jane@example.com", "phone": "+2348012345678", "ticketTypeId": "..." }`

**Response `200` (free):** `{ "registration": { "id", "attendeeName", "attendeeEmail", "status": "CONFIRMED" } }`

**Response `200` (paid):** `{ "registration": { "id", "status": "PENDING" }, "paymentUrl": "https://checkout.paystack.com/..." }`

---

### Tickets

---

#### `GET /api/v1/tickets/:ticketId`

View a ticket and its QR code image.

**Auth:** Token-based (secure link)

**Response `200`:**

```json
{ "ticket": { "id", "code", "attendeeName", "attendeeEmail", "status", "event": { "title", "startTime", "venue" } }, "qrDataUrl": "data:image/png;base64,..." }
```

---

#### `GET /api/v1/events/:eventId/tickets`

List all tickets for an event.

**Auth:** Owner (ORGANIZER)

**Query:** `?page=1&limit=20&status=UNUSED`

**Response `200`:** `{ "tickets": [...], "pagination": { ... } }`

---

#### `POST /api/v1/events/:eventId/tickets/export`

Export all event tickets as a CSV file download.

**Auth:** Owner (ORGANIZER)

**Response:** CSV file download (`Content-Type: text/csv`)

---

#### `GET /api/v1/tickets/:ticketId/download`

Download a ticket as a printable PDF.

**Auth:** Token-based (secure link)

**Response:** PDF file download (`Content-Type: application/pdf`)

---

### Staff Management

---

#### `POST /api/v1/events/:eventId/staff`

Assign a registered user as staff for an event.

**Auth:** Owner (ORGANIZER)

**Body:** `{ "email": "staff@example.com", "permissionScope": "check-in-only" }`

**Response `201`:** `{ "assignment": { "id", "eventId", "userId", "permissionScope", "active": true } }`

---

#### `GET /api/v1/events/:eventId/staff`

List all staff assigned to an event.

**Auth:** Owner (ORGANIZER)

**Response `200`:** `{ "staff": [{ "id", "userId", "name", "email", "permissionScope", "active" }] }`

---

#### `DELETE /api/v1/events/:eventId/staff/:staffId`

Remove a staff member from an event.

**Auth:** Owner (ORGANIZER)

**Response:** `204 No Content`

---

### Check-ins

---

#### `POST /api/v1/checkins/:eventId/scan`

Scan a QR code to check in an attendee. Uses distributed locking to prevent race conditions.

**Auth:** STAFF (assigned to event)

**Body:** `{ "token": "qr-token-string", "deviceInfo": "iPhone 15 - CheckIn App v1.0" }`

| Result | Meaning |
|--------|---------|
| `VALID` | Check-in successful |
| `DUPLICATE` | Attendee already checked in |
| `INVALID` | Token expired, wrong event, or not found |

**Response `200` (valid):** `{ "result": "VALID", "message": "Check-in successful", "attendeeName": "Jane Doe", "checkinId": "..." }`

**Response `409`:** Scan already in progress (Redis lock held)

---

#### `GET /api/v1/checkins/:eventId/checkins`

List all check-ins for an event with attendee and staff details.

**Auth:** ORGANIZER / STAFF

**Response `200`:**

```json
{ "data": [{ "id", "eventId", "scannedAt", "result", "deviceInfo", "registration": { "attendeeName", "attendeeEmail" }, "staff": { "name", "email" } }] }
```

---

#### `POST /api/v1/checkins/:eventId/checkins/:checkInId/undo`

Undo a check-in. Creates an audit log entry with a before-snapshot.

**Auth:** Owner (ORGANIZER)

**Response `200`:** `{ "data": { "success": true } }`

---

### Payments

---

#### `POST /api/v1/payments/webhook`

Paystack webhook callback. Handles `charge.success` events to confirm payments and issue tickets. Idempotent — duplicate webhooks are safely ignored.

**Auth:** Paystack HMAC-SHA512 signature verification

**Response `200`:** `{ "status": "success" }`

---

#### `POST /api/v1/payments/verify/:reference`

Manually verify a payment with Paystack. Use as a fallback when webhooks fail.

**Auth:** No

**Response `200`:** `{ "payment": { "id", "paystackReference", "amount", "currency", "status" } }`

---

### Reports & Dashboard

---

#### `GET /api/v1/events/:eventId/dashboard`

Get event dashboard statistics: registration counts, check-in rates, no-shows, capacity utilization, and ticket type breakdown.

**Auth:** Owner (ORGANIZER)

**Response `200`:**

```json
{ "registrations": { "total", "confirmed", "pending" }, "checkins": { "total", "valid", "duplicate" }, "noShows": 20, "capacity": { "max", "utilization" }, "ticketBreakdown": [{ "ticketType", "sold", "checkedIn" }] }
```

---

#### `GET /api/v1/events/:eventId/exports/attendance`

Export attendance data (check-in records with attendee info) as CSV.

**Auth:** Owner (ORGANIZER)

**Response:** CSV file download

---

#### `GET /api/v1/events/:eventId/exports/registrations`

Export registration data as CSV.

**Auth:** Owner (ORGANIZER)

**Response:** CSV file download

---

## Enums

| Enum | Values |
|------|--------|
| `UserRole` | `ATTENDEE`, `STAFF`, `ORGANIZER`, `ADMIN` |
| `UserStatus` | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `EventStatus` | `DRAFT`, `PUBLISHED`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `TicketCodeStatus` | `UNUSED`, `USED`, `REVOKED` |
| `RegistrationStatus` | `PENDING`, `CONFIRMED`, `CANCELLED` |
| `CheckInResult` | `VALID`, `DUPLICATE`, `INVALID` |
| `PaymentStatus` | `PENDING`, `SUCCESS`, `FAILED`, `REFUNDED` |
| `InvoiceStatus` | `PENDING`, `PAID`, `OVERDUE`, `CANCELLED` |
| `NotificationStatus` | `PENDING`, `SENT`, `FAILED`, `READ` |
