# QPass API Reference

- **Base URL:** `http://localhost:3000`
- **Version:** v1 (all endpoints under `/api/v1` unless noted)
- **Counts:** 11 tags, 42 paths, 50 operations
- **Live docs:** Swagger UI at `http://localhost:3000/api-docs` (serves the same OpenAPI 3 spec that this document summarizes)

All responses use the envelope:

```json
{ "status": "success" | "error", "message": "...", "data": { ... } }
```

File downloads (CSV / PDF) bypass the envelope and stream the file directly.

---

## Authentication

Protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Tokens are obtained from register / login. Access tokens expire in **30 minutes**; refresh tokens are long-lived (**7 days**) and used to rotate access tokens without re-authenticating. Refresh tokens are blacklisted on logout and on every refresh (rotation).

---

## Roles

| Role | Access Level |
|------|-------------|
| `ATTENDEE` | Registers for events, views own tickets |
| `STAFF` | Scans QR codes at event check-in (needs an active assignment to the event) |
| `ORGANIZER` | Creates and manages own events, assigns staff, imports attendees, views reports |
| `ADMIN` | Full system access across all events, plus audit logs |

Organizers can only access their own resources unless they have the `ADMIN` role, which bypasses ownership checks.

---

## Rate Limiting

- **Global:** 100 requests / 15 min per IP (applied to all endpoints)
- **Auth endpoints:** 5 requests / 15 min per IP (`register`, `login`, `refresh`, `forgot-password`, `reset-password`, `change-password`, `request-verification`, `verify-email`, `google`)

Rate-limited requests receive a `429 Too Many Requests` response.

---

## Error Format

| HTTP Status | Meaning |
|:-----------:|---------|
| 400 | Bad request / missing fields |
| 401 | Missing or invalid access token |
| 403 | Authenticated but insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, already registered, duplicate check-in, lock held) |
| 413 | File too large |
| 422 | Validation failed (Zod schema errors) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Pagination

List endpoints accept `page` and `limit` query parameters (defaults: `page=1`, `limit=20`).

Response includes:

```json
{ "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 } }
```

---

## Endpoints

### 1. Health

---

#### `GET /health`

Check database and Redis connectivity. No authentication.

```json
// 200
{ "status": "healthy", "timestamp": "...", "checks": { "database": "ok", "redis": "ok" } }

// 503 (degraded)
{ "status": "degraded", "checks": { "database": "unavailable", "redis": "ok" } }
```

---

### 2. Auth

---

#### `POST /api/v1/auth/register`

Create a new user account. Default role is `ATTENDEE`. An optional `role` of `ATTENDEE`, `ORGANIZER`, or `STAFF` may be supplied; `ADMIN` cannot be self-assigned. Rate limit: 5 / 15 min.

**Auth:** No

**Body:**

```json
{ "name": "John Doe", "email": "john@example.com", "password": "SecurePass123", "role": "ORGANIZER" }
```

**Password rules:** at least 8 characters, one uppercase letter, one lowercase letter, and one number.

**Response `201`:**

```json
{ "data": { "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "ORGANIZER" }, "accessToken": "...", "refreshToken": "..." } }
```

---

#### `POST /api/v1/auth/login`

Authenticate and receive tokens. Rate limit: 5 / 15 min.

**Auth:** No

**Body:** `{ "email": "john@example.com", "password": "SecurePass123" }`

**Response `200`:** same shape as register (`data.user` + `data.accessToken` + `data.refreshToken`)

**Response `401`:** invalid email or password

---

#### `GET /api/v1/auth/google`

Start **Sign in with Google**. Redirects the browser to Google's consent screen. Handles both **sign-up** (new Google account) and **sign-in** (email already on file) in one flow. Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to be configured.

**Auth:** No · Rate limit: 5 / 15 min

**Query params:** `role` (optional) — role to assign when the Google account is created (`ATTENDEE` (default) | `ORGANIZER` | `STAFF`).

**Response `302`:** redirect to Google's consent screen.

#### `GET /api/v1/auth/google/callback`

Google redirects the browser here after consent. The backend exchanges the code, verifies the email is `email_verified`, then either creates the account (**sign-up**, role from the initiating request) or matches the email to an existing one (**sign-in**). Google-created accounts have a random unusable password hash, so they can only sign in with Google, and are created with their email already verified (no verification email needed).

**Auth:** No

**Response `302` on success** → `OAUTH_FRONTEND_REDIRECT_URL` (default: `FRONTEND_URL/pages/dashboard.html`) with the tokens delivered in the URL **fragment** (never the query string):

```text
#access_token=...&refresh_token=...&mode=login|signup
```

`mode` is `signup` for a new account and `login` for an existing one.

**Response `302` on failure** → same redirect URL with:

```text
?error=<stable_code>&error_description=<message_text>
```

Stable `error` codes:

- `invalid_request` — the callback was missing the required `code`/`state` query params.
- `google_oauth_failed` — any other failure (invalid/expired state, Google email not verified, account suspended, or token/profile exchange error).

The user-facing `error_description` carries the exact message text (from `src/config/system_messages.js`):

- `Google sign-in session expired or is invalid, please try again` — invalid/expired `state`
- `Your Google account email is not verified` — the Google email is not verified
- `Account has been suspended` — the matching account is suspended
- `Google OAuth failed` — token/profile exchange failure
- `Missing authorization code or state` — used with `error=invalid_request`

> **Frontend integration:** read the params with `new URLSearchParams(window.location.hash.slice(1))`, store `access_token`/`refresh_token` (e.g. in `localStorage`), strip them from the URL (`history.replaceState`), then call `GET /api/v1/auth/me` with `Authorization: Bearer <access_token>` for the full profile.

---

#### `POST /api/v1/auth/refresh`

Exchange a valid refresh token for a new access + refresh pair. The old refresh token is blacklisted.

**Auth:** Valid refresh token

**Body:** `{ "refreshToken": "..." }`

**Response `200`:** `{ "data": { "accessToken": "...", "refreshToken": "..." } }`

**Response `401`:** invalid or expired refresh token

---

#### `POST /api/v1/auth/logout`

Blacklist the current refresh token.

**Auth:** Authenticated

**Body:** `{ "refreshToken": "..." }`

**Response `200`:** `{ "status": "success", "message": "Logged out successfully", "data": null }`

---

#### `POST /api/v1/auth/forgot-password`

Send a password reset email. Returns a generic message regardless of whether the email exists, to prevent account enumeration. Rate limit: 5 / 15 min.

**Auth:** No

**Body:** `{ "email": "john@example.com" }`

**Response `200`:** `{ "status": "success", "message": "If an account exists with that email, a reset link has been sent", "data": { "resetToken": "<non-production only>" } }`

**Note:** The reset token is stored (hashed) in Redis with a 15-minute TTL. In non-production environments the raw token is returned in the payload for local testing; in production the payload is empty.

---

#### `POST /api/v1/auth/reset-password`

Reset the password using the token from the reset email. Rate limit: 5 / 15 min.

**Auth:** No

**Body:** `{ "token": "...", "password": "NewSecurePass123" }`

**Response `200`:** `{ "status": "success", "message": "Password reset successful", "data": null }`

**Response `401`:** invalid or expired reset token

---

#### `GET /api/v1/auth/me`

Get the authenticated user's profile.

**Auth:** Authenticated

**Response `200`:** `{ "status": "success", "data": { "id": "...", "name": "...", "email": "...", "role": "...", "phone": null, "emailVerifiedAt": null, "createdAt": "..." } }`

---

#### `PATCH /api/v1/auth/me`

Update the authenticated user's profile (`name`, `phone`). Empty `phone` clears it.

**Auth:** Authenticated

**Body:** `{ "name": "John Doe", "phone": "080..." }`

**Response `200`:** `{ "status": "success", "message": "Profile updated successfully", "data": { "id": "...", "name": "...", "email": "...", "role": "...", "phone": "080...", "emailVerifiedAt": null, "createdAt": "..." } }`
**Response `422`:** invalid phone / name too long

---

#### `POST /api/v1/auth/change-password`

Change the current password. Rate limit: 5 / 15 min.

**Auth:** Authenticated

**Body:** `{ "currentPassword": "...", "newPassword": "NewSecurePass123" }`

**Response `200`:** `{ "status": "success", "message": "Password changed successfully", "data": null }`

**Response `401`:** current password is incorrect

---

#### `POST /api/v1/auth/request-verification`

Send an email verification email to the authenticated user. In non-production environments the raw verify token is returned for local testing. Rate limit: 5 / 15 min.

**Auth:** Authenticated

**Response `200`:** `{ "status": "success", "message": "Verification email sent", "data": { "verifyToken": "<non-production only>" } }`

**Response `400`:** email already verified

---

#### `POST /api/v1/auth/verify-email`

Complete email verification using the token from the verification email. Rate limit: 5 / 15 min.

**Auth:** No

**Body:** `{ "token": "..." }`

**Response `200`:** `{ "status": "success", "message": "Email verified successfully", "data": null }`

**Response `401`:** invalid or expired verification token

---

#### `GET /api/v1/auth/sessions`

List the authenticated user's active sessions.

**Auth:** Authenticated

**Response `200`:** `{ "status": "success", "data": { "sessions": [ { "id": "<64-char session id>", "userAgent": "...", "createdAt": "...", "expiresAt": "..." } ] } }`

---

#### `DELETE /api/v1/auth/sessions/{sessionId}`

Revoke a specific session. The `sessionId` is the 64-char SHA-256 hash of the refresh token.

**Auth:** Authenticated

**Response `200`:** `{ "status": "success", "message": "Session revoked successfully", "data": null }`

**Response `400`:** invalid session id

---

### 3. Events

---

#### `POST /api/v1/events`

Create a new event. Starts in `DRAFT` status.

**Auth:** ORGANIZER / ADMIN

**Body:**

```json
{
  "title": "Tech Conference 2026",
  "description": "...",
  "venue": "Lagos Convention Center",
  "startTime": "2026-09-15T09:00:00Z",
  "endTime": "2026-09-15T17:00:00Z",
  "capacity": 500,
  "registrationMode": "PUBLIC_LINK",
  "isPaid": false,
  "currency": "NGN",
  "registrationOpensAt": "...",
  "registrationClosesAt": "..."
}
```

**Response `201`:** `{ "data": { "id": "...", "title": "...", "status": "DRAFT", "slug": "...", "ownerId": "..." } }`

---

#### `GET /api/v1/events`

List events. ORGANIZER sees their own events; ADMIN sees all non-deleted events.

**Auth:** ORGANIZER / ADMIN

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `status` | string | Filter by `EventStatus` (`DRAFT`, `PUBLISHED`, `ACTIVE`, `COMPLETED`, `CANCELLED`) |

**Response `200`:** `{ "data": { "events": [...], "pagination": { ... } } }`

---

#### `GET /api/v1/events/{id}`

Get full event details by ID.

**Auth:** Owner (ORGANIZER) / ADMIN

**Response `200`:** `{ "data": { "id", "title", "description", "venue", "startTime", "endTime", "status", "slug", "ownerId", "ticketTypes": [...] } }`

**Response `404`:** event not found (or not owned)

---

#### `PATCH /api/v1/events/{id}`

Update event details.

**Auth:** ORGANIZER / ADMIN (owner)

**Body (all optional):** `{ "title", "description", "venue", "startTime", "endTime", "capacity", "currency", "registrationOpensAt", "registrationClosesAt" }`

**Response `200`:** `{ "data": { ...event } }`

---

#### `DELETE /api/v1/events/{id}`

Delete an event (soft delete via `deletedAt`).

**Auth:** ORGANIZER / ADMIN (owner)

**Response `200`:** deleted event data

---

#### `POST /api/v1/events/{id}/publish`

Publish a draft event. Generates a unique public slug.

**Auth:** ORGANIZER / ADMIN (owner)

**Constraints:** event must currently be in `DRAFT`.

**Response `200`:** `{ "data": { "id": "...", "status": "PUBLISHED", "slug": "tech-conference-2026-a1b2c3" } }`

---

#### `POST /api/v1/events/{id}/cancel`

Cancel a published event. Draft events cannot be cancelled (use delete instead).

**Auth:** ORGANIZER / ADMIN (owner)

**Response `200`:** `{ "data": { "id": "...", "status": "CANCELLED" } }`

---

### 4. Ticket Types

---

#### `POST /api/v1/events/{eventId}/ticket-types`

Create a ticket type for an event.

**Auth:** ORGANIZER / ADMIN (owner)

**Body:** `{ "name": "General Admission", "description": "...", "price": 5000, "capacity": 200 }`

**Response `201`:** `{ "data": { "id", "eventId", "name", "price", "capacity", "sortOrder", "active": true } }`

**Note:** `sortOrder` is unique per event. Price is an integer in the event currency's minor unit.

---

#### `GET /api/v1/events/{eventId}/ticket-types`

List all ticket types for an event with sold counts.

**Auth:** ORGANIZER / ADMIN (owner)

**Response `200`:** `{ "data": [{ "id", "name", "price", "capacity", "quantitySold", "sortOrder", "active" }] }`

---

#### `PATCH /api/v1/events/{eventId}/ticket-types/{id}`

Update a ticket type.

**Auth:** ORGANIZER / ADMIN (owner)

**Body (all optional):** `{ "name", "description", "price", "capacity", "active", "sortOrder" }`

**Response `200`:** `{ "data": { ...ticketType } }`

---

#### `DELETE /api/v1/events/{eventId}/ticket-types/{id}`

Delete a ticket type.

**Auth:** ORGANIZER / ADMIN (owner)

**Response `200`:** deleted ticket type

**Response `409`:** cannot delete because registrations reference this ticket type (FK restrict)

---

### 5. Tickets

---

#### `GET /api/v1/events/{eventId}/tickets`

List tickets (registrations) for an event.

**Auth:** Owner (ORGANIZER) / ADMIN

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `status` | string | Filter by `RegistrationStatus` (`PENDING`, `CONFIRMED`, `CANCELLED`) |
| `paymentStatus` | string | Filter by `PaymentStatus` (`PENDING`, `SUCCESS`, `FAILED`, `REFUNDED`) |

**Response `200`:** `{ "data": { "tickets": [...], "pagination": { ... } } }`

---

#### `POST /api/v1/events/{eventId}/tickets/export`

Export all tickets for an event as CSV or PDF.

**Auth:** Owner (ORGANIZER) / ADMIN

**Body:** `{ "format": "csv" | "pdf" }`

**Response `200`:** file download (`Content-Type: text/csv` or `application/pdf`)

---

#### `GET /api/v1/tickets/{ticketId}`

View a ticket (registration) and its QR code data URL.

**Auth:** Authenticated; caller must be the attendee or the event owner

**Response `200`:** `{ "data": { "id", "code", "attendeeName", "attendeeEmail", "status", "event": { "title", "startTime", "venue" }, "qrDataUrl": "data:image/png;base64,..." } }`

---

#### `GET /api/v1/tickets/{ticketId}/download`

Download a ticket as a printable PDF (includes event details and QR code).

**Auth:** Authenticated; caller must be the attendee or the event owner

**Response `200`:** PDF file download (`Content-Type: application/pdf`)

---

#### `GET /api/v1/tickets/me`

List all tickets belonging to the authenticated user (ticket history), matched by the caller's email. Soft-deleted and cancelled events are excluded; cancelled registrations on live events are still shown. Returns event details, ticket type, ticket code, and whether the ticket has been checked in.

**Auth:** Authenticated (any role; always scoped to the caller)

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max 100) |

**Response `200`:**

```json
{ "data": { "tickets": [{ "id", "attendeeName", "attendeeEmail", "status", "paymentStatus", "confirmationCode", "ticketType": { "id", "name", "price" }, "ticketCode", "checkedIn", "event": { "id", "title", "slug", "venue", "startTime", "endTime", "status" }, "createdAt" }], "pagination": { "page", "limit", "total", "totalPages" } } }
```

---

### 6. Registrations (Public)

---

#### `GET /api/v1/e/{slug}`

Get a public event by slug with its active ticket types. No authentication required.

**Auth:** No

**Response `200`:** `{ "data": { "id", "title", "description", "venue", "slug", "startTime", "endTime", "status", "registrationMode", "isPaid", "capacity", "currency", "registrationOpensAt", "registrationClosesAt", "ticketTypes": [...] } }`

**Note:** `ownerId` and internal fields are never exposed on this endpoint.

**Response `404`:** event not found or not publicly viewable

---

#### `POST /api/v1/registrations/free`

Register for a free public event. Creates a `CONFIRMED` registration with a QR token and emails confirmation + QR to the attendee. No authentication required.

**Auth:** No

**Body:** `{ "slug": "tech-conference-2026-a1b2c3", "name": "Jane Doe", "email": "jane@example.com", "phone": "+2348012345678", "ticketTypeId": "...", "metadata": { } }`

**Response `201`:** `{ "data": { "registration": { "id", "attendeeName", "attendeeEmail", "status": "CONFIRMED", "confirmationCode": "..." }, "qrDataUrl": "data:image/png;base64,..." } }`

**Response `400`:** event closed / capacity full / invalid ticket type
**Response `409`:** attendee already registered for this event

---

### 7. Attendee Import

---

#### `POST /api/v1/events/{eventId}/import`

Upload a file to batch-import attendees. Supported types: CSV, XLSX, PDF, DOCX. Max size: 5 MB. Each valid row creates a `Registration`, `TicketCode`, and `QrToken`. Returns per-row validation errors for failed rows.

**Auth:** ORGANIZER (owner) | **Content-Type:** `multipart/form-data`

| Field | Type | Constraints |
|-------|------|-------------|
| `file` | File | `.csv`, `.xlsx`, `.pdf`, `.docx`, max 5 MB, max 1000 rows |

Expected columns: `Name`, `Email`, `Phone`, `TicketType`.

**Response `201`:**

```json
{ "data": { "batchId": "...", "totalRows": 100, "successRows": 95, "failedRows": 5, "errors": [{ "row": 12, "email": "bad@bad", "reason": "Invalid email format" }] } }
```

---

#### `GET /api/v1/events/{eventId}/import`

List import batches for an event, newest first.

**Auth:** ORGANIZER (owner)

**Response `200`:** `{ "data": [{ "id", "originalFilename", "fileType", "totalRows", "successRows", "failedRows", "status", "createdAt" }] }`

---

#### `GET /api/v1/events/{eventId}/import/{batchId}`

Get a single import batch with its success/failure summary and per-row error report.

**Auth:** ORGANIZER (owner)

**Response `200`:** `{ "data": { "id", "originalFilename", "fileType", "totalRows", "successRows", "failedRows", "status", "errorReport": [...], "createdAt", "completedAt" } }`

---

#### `GET /api/v1/events/{eventId}/import-template`

Download a template with the correct column headers for the import endpoint.

**Auth:** ORGANIZER (owner)

**Query:** `?format=csv` (default) or `?format=pdf`

**Response `200`:** file download (`Content-Type: text/csv` or `application/pdf`)

---

### 8. Staff Management

---

#### `POST /api/v1/events/{eventId}/staff`

Assign staff to an event. If no account exists for the email, a pending `STAFF` user is created automatically. Creates an `EventStaffAssignment` and sends a staff invite email.

**Auth:** ORGANIZER (owner)

**Body:** `{ "email": "staff@example.com", "permissionScope": "check-in-only" }`

**Response `201`:** `{ "data": { "id", "eventId", "userId", "permissionScope", "active": true } }`

**Response `409`:** user is already assigned as staff for this event
**Response `403`:** cannot assign a privileged user (ORGANIZER / ADMIN) as staff

---

#### `GET /api/v1/events/{eventId}/staff`

List active staff assignments for an event, newest first.

**Auth:** ORGANIZER (owner)

**Response `200`:** `{ "data": [{ "id", "eventId", "userId", "name", "email", "permissionScope", "active", "assignedAt" }] }`

---

#### `DELETE /api/v1/events/{eventId}/staff/{staffId}`

Remove a staff member from an event. Records an audit log entry.

**Auth:** ORGANIZER (owner)

**Response `200`:** `{ "data": { "id", "eventId" } }`

---

### 9. Check-ins

---

#### `POST /api/v1/checkins/{eventId}/scan`

Scan a QR code to check in an attendee.

**Auth:** STAFF / ORGANIZER; caller must be the event owner or have an active staff assignment

**Body:** `{ "token": "qr-token-string", "deviceInfo": "iPhone 15 - CheckIn App v1.0" }`

**Flow:** takes a Redis distributed lock (10 s TTL) to prevent duplicate in-flight scans, looks up the SHA-256 hash of the token, maps the result, creates the `CheckIn` row (DB-enforced unique on `eventId + registrationId`), writes an audit log, and emits `checkin:update` on the dashboard room after every scan attempt.

**Result mapping:**

| Result | Meaning |
|--------|---------|
| `VALID` | Check-in successful |
| `DUPLICATE` | Attendee already checked in |
| `INVALID` | Token not found, or registration not confirmed |
| `EXPIRED` | QR token has expired |
| `WRONG_EVENT` | QR belongs to a different event |
| `REVOKED` | QR token has been revoked |
| `NOT_AUTHORIZED` | Caller is not the owner or an active assigned staff member |

**Response `200` (valid):** `{ "data": { "result": "VALID", "message": "...", "attendeeName": "Jane Doe", "checkinId": "..." } }`

**Response `403`:** caller not authorized for this event (`NOT_AUTHORIZED`)
**Response `409`:** scan already in progress (Redis lock held)

---

#### `GET /api/v1/checkins/{eventId}/checkins`

List all check-ins for an event with attendee and staff details. Undone (soft-deleted) check-ins are excluded.

**Auth:** STAFF / ORGANIZER

**Response `200`:**

```json
{ "data": [{ "id", "eventId", "scannedAt", "result", "deviceInfo", "registration": { "attendeeName", "attendeeEmail" }, "staff": { "name", "email" } }] }
```

---

#### `POST /api/v1/checkins/{eventId}/checkins/{checkInId}/undo`

Undo a check-in. Soft-deletes the `CheckIn` row (`deletedAt`), reverts the registration status to `CONFIRMED`, re-enables the QR token, and writes an audit log entry with a before-snapshot.

**Auth:** STAFF / ORGANIZER; event owner or the staff member who performed the scan

**Constraints:** cannot undo a check-in older than 24 hours.

**Response `200`:** `{ "data": { "success": true } }`

**Response `400`:** check-in is older than 24 hours
**Response `403`:** caller is neither the event owner nor the scanning staff
**Response `404`:** check-in not found

---

#### `GET /api/v1/checkins/stats`

Get check-in statistics. Without an `eventId` this returns system-wide totals (ADMIN only); with an `eventId` the caller must be the event owner, an ADMIN, or an active assigned staff member.

**Auth:** ADMIN (global) / ADMIN, ORGANIZER, or active STAFF (scoped to an event)

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `eventId` | string (uuid) | Optional event ID to scope statistics to |

**Response `200`:**

```json
{ "data": { "checkins": { "total", "valid", "duplicate" }, "uniqueAttendeesCheckedIn", "eventsWithCheckins" } }
```

**Response `403`:** caller lacks permission for the requested scope
**Response `404`:** scoped event not found

---

### 10. Reports & Dashboard

---

#### `GET /api/v1/events/{eventId}/dashboard`

Get event dashboard statistics: registration counts, check-in rates, capacity utilization, and ticket-type breakdown.

**Auth:** ORGANIZER / ADMIN / active assigned STAFF

**Response `200`:**

```json
{ "data": { "registrations": { "total", "confirmed", "pending", "cancelled" }, "checkins": { "total", "valid", "duplicate", "invalid", "expired", "wrongEvent", "revoked" }, "capacity": { "max", "utilization" }, "ticketBreakdown": [{ "ticketType", "sold", "checkedIn" }] } }
```

---

#### `GET /api/v1/events/{eventId}/exports/registrations`

Export all registrations for an event as CSV or PDF.

**Auth:** ORGANIZER / ADMIN (owner)

**Query:** `?format=csv` (default) or `?format=pdf`

**Response `200`:** file download (`Content-Type: text/csv` or `application/pdf`)

---

#### `GET /api/v1/events/{eventId}/exports/attendance`

Export check-in records (attendance) with attendee info as CSV or PDF.

**Auth:** ORGANIZER / ADMIN (owner)

**Query:** `?format=csv` (default) or `?format=pdf`

**Response `200`:** file download (`Content-Type: text/csv` or `application/pdf`)

---

#### `GET /api/v1/analytics/overview`

Get overview totals: event count, published event count, total registrations, distinct attendee count, and registered attendee accounts.

**Auth:** Authenticated. ADMIN callers see every event by default; all other roles are always restricted to their own events. Pass `?scope=own` to force the organizer-scoped view. `?scope=system` is ADMIN only.

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `scope` | string | `own` or `system` (optional; default is system for ADMIN, own for others) |

**Response `200`:**

```json
{ "data": { "totalEvents", "publishedEvents", "totalAttendees", "totalRegistrations", "registeredUsers" } }
```

**Response `403`:** a non-ADMIN requested `?scope=system`

---

### 11. Admin

---

#### `GET /api/v1/audit-logs`

List the audit trail, newest first. Filterable by action, entity, actor ID, and creation date range.

**Auth:** ADMIN only

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page (max 100) |
| `action` | string | e.g. `STAFF_ASSIGN`, `CHECKIN_VALID`, `UNDO_CHECKIN`, `PUBLIC_REGISTRATION` |
| `entity` | string | e.g. `CheckIn`, `Registration`, `EventStaffAssignment` |
| `actorId` | uuid | The user who performed the action |
| `from` | date-time | Only entries created at or after this timestamp |
| `to` | date-time | Only entries created at or before this timestamp |

**Response `200`:** `{ "data": { "logs": [{ "id", "actorId", "action", "entity", "entityId", "beforeSnapshot", "afterSnapshot", "createdAt" }], "pagination": { ... } } }`

---

## Real-time Events (Socket.IO)

Socket.IO is mounted on the same HTTP server. Clients authenticate by passing the access token in `socket.handshake.auth.token`. Rooms reject unauthorized joins.

| Room | Event | When emitted |
|------|-------|-------------|
| `event:{eventId}:dashboard` | `checkin:update` | after every scan attempt (result + timestamp + total checked in) |
| `event:{eventId}:dashboard` | `registration:new` | after a new public registration |
| `event:{eventId}:scan` | `scan:result` | per-scan feedback to the staff device |

A Redis adapter (pub/sub) propagates room messages across server instances; it falls back to in-memory when Redis is unreachable.

---

## Enums

| Enum | Values |
|------|--------|
| `UserRole` | `ATTENDEE`, `STAFF`, `ORGANIZER`, `ADMIN` |
| `UserStatus` | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `EventStatus` | `DRAFT`, `PUBLISHED`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `TicketCodeStatus` | `UNUSED`, `USED`, `REVOKED` |
| `RegistrationStatus` | `PENDING`, `CONFIRMED`, `CANCELLED` |
| `CheckInResult` | `VALID`, `DUPLICATE`, `INVALID`, `EXPIRED`, `WRONG_EVENT`, `REVOKED`, `NOT_AUTHORIZED` |
| `PaymentStatus` | `PENDING`, `SUCCESS`, `FAILED`, `REFUNDED` |
| `InvoiceStatus` | `PENDING`, `PAID`, `OVERDUE`, `CANCELLED` |
| `NotificationStatus` | `PENDING`, `SENT`, `FAILED`, `READ` |
| `RegistrationMode` | `PUBLIC_LINK`, `CLOSED_IMPORT`, `HYBRID` |
| `RegistrationSource` | `IMPORT`, `PUBLIC_LINK` |

---

*Keep this document in sync with the Swagger spec. Run `npm run docs` to regenerate the spec file if the route annotations change.*
