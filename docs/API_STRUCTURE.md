# Phase 2 API Structure & Documentation Template

> **⚠️ DISCLAIMER: ASPIRATIONAL DOCUMENT**
> The endpoints outlined in Sections 2 (Event Management), 3 (Ticket Code Management), and 4 (Attendee Verification) are currently **planned and not yet implemented** in the codebase. This document serves as a roadmap for Phase 2 development.

This document outlines the planned API structure for Phase 2 of the QPass-Backend project.

## 1. Authentication & Authorization

**Base Path:** `/api/v1/auth`

| Method | Endpoint    | Description                                      | Roles Required |
|--------|-------------|--------------------------------------------------|----------------|
| POST   | `/register` | Register a new user                              | Public         |
| POST   | `/login`    | Authenticate and receive JWT + Refresh Token     | Public         |
| POST   | `/refresh`  | Exchange refresh token for new access token      | Public         |
| POST   | `/logout`   | Revoke refresh token and log out                 | Public         |

*Note: All protected endpoints below require a valid JWT passed in the `Authorization: Bearer <token>` header.*

## 2. Event Management (CRUD)

**Base Path:** `/api/v1/events`

| Method | Endpoint        | Description                                      | Roles Required       |
|--------|-----------------|--------------------------------------------------|----------------------|
| GET    | `/`             | List all events                                  | Any                  |
| POST   | `/`             | Create a new event                               | ORGANIZER, ADMIN     |
| GET    | `/:eventId`     | Get details of a specific event                  | Any                  |
| PATCH  | `/:eventId`     | Update event details                             | ORGANIZER, ADMIN     |
| DELETE | `/:eventId`     | Delete/cancel an event                           | ORGANIZER, ADMIN     |

## 3. Ticket Code Management

**Base Path:** `/api/v1/events/:eventId/tickets`

| Method | Endpoint        | Description                                      | Roles Required       |
|--------|-----------------|--------------------------------------------------|----------------------|
| POST   | `/upload`       | Upload ticket codes via CSV parsing              | ORGANIZER, ADMIN     |
| GET    | `/`             | List ticket codes and track statuses             | STAFF, ORGANIZER     |
| POST   | `/validate`     | Validate a specific ticket code status           | STAFF, ORGANIZER     |

## 4. Attendee Verification & QR Token

**Base Path:** `/api/v1/events/:eventId/attendees`

| Method | Endpoint        | Description                                      | Roles Required       |
|--------|-----------------|--------------------------------------------------|----------------------|
| POST   | `/verify`       | Verify an attendee using their ticket code       | Public / ATTENDEE    |
| POST   | `/qr-token`     | Generate signed JWT QR token for the attendee    | ATTENDEE             |

---
