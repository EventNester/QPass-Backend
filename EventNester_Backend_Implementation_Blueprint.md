EventNester
Backend Technical Requirements Document
QR Code-Based Event Attendance & Ticket Verification System
Group 13 Capstone Project
Version 2.0 | Date: 2026-07-18
Table of Contents
1. Executive Summary
2. Project Overview
3. Backend Objectives & Scope
4. Technology Stack
5. Architecture & Design
6. API Specifications
7. Database Schema & Data Model
8. Authentication & Authorization
9. Core Workflows
10. Email Service Integration (Notifications)
11. Payment Gateway Integration (Paystack)
12. Non-Functional Requirements
13. Security Requirements
14. Testing Strategy
15. Deployment & Operations
16. Deliverables & Timeline
17. Assumptions & Constraints
18. Glossary & Key References
Conclusion
1. Executive Summary
The EventNester backend is a REST API that powers a QR code-based event attendance and ticket verification system. It provides ticket validation, QR token generation, real-time attendance tracking, and comprehensive event reporting. The backend integrates with Paystack for secure payment processing and uses WebSocket connectivity for live organizer dashboards.
Key Responsibilities:
Validate attendee ticket verification codes
Generate cryptographically signed QR tokens
Record and prevent duplicate attendance entries
Provide real-time attendance updates via WebSocket
Process payments via Paystack integration
Send transactional email notifications through the selected provider
Generate detailed attendance reports and analytics
Maintain complete audit trails for all operations

2. Project Overview
Product Vision
EventNester solves the problem of slow, error-prone event check-in processes by providing organizers with a secure, fast, and reliable QR code-based attendance verification system.
Problem Statement
Manual check-in processes lead to long queues
Screenshot-based tickets enable duplicate entry and fraud
No centralized attendance validation mechanism
Poor post-event analytics and reporting
Difficulty tracking attendance across large events
Target Users
Event Organizers – Create events and upload ticket codes
Event Staff – Scan QR codes at venues
Attendees – Verify tickets and generate QR codes
Platform Admins – Oversee system and manage accounts
3. Backend Objectives & Scope
Primary Objectives
Establish a secure, stable contract layer for all frontend and mobile clients
Validate and process ticket verification codes with zero tolerance for data loss
Generate cryptographically signed QR tokens that cannot be forged or reused
Record every attendance event with full auditability
Provide real-time attendance updates to organizer dashboards
Integrate with Paystack for secure payment processing
Deliver comprehensive attendance reporting and analytics
In-Scope Deliverables
REST API with OpenAPI/Swagger documentation
JWT-based authentication and role-based authorization
Event, ticket code, and registration management
QR token generation and validation
Check-in recording and duplicate detection
Real-time updates via Socket.IO
Paystack payment gateway integration
Email notifications service using Brevo or compatible provider abstraction
Attendance reports and data export
Redis-backed caching and locking
PostgreSQL database with Prisma ORM
Comprehensive logging and error handling
Automated testing suite (unit and integration)
Docker containerization and deployment scripts
Complete API documentation and operational guides
Out-of-Scope
Frontend or mobile UI development
Venue hardware integration
Microservices architecture
Advanced fraud detection (AI/ML)
SMS delivery and self-hosted email infrastructure (email delivery uses third-party provider integration)
Video streaming or media hosting
4. Technology Stack
Layer
Technology
Justification
Runtime
Node.js 22 LTS
Strong ecosystem, proven production reliability, excellent async support
Framework
Express.js 5.x
Lightweight, well-understood routing and middleware, minimal boilerplate
Language
JavaScript (ES2023)
Modern modules, consistent with frontend/mobile stack, fast development
Database
PostgreSQL 15+
Relational model fits event-ticket-attendance workflows, strong ACID guarantees
ORM
Prisma ORM
Type-safe schema, auto-migrations, excellent developer experience
Validation
Zod
Runtime type validation, excellent error messages, single source of truth
Cache & Pub/Sub
Redis
Duplicate scan locking, caching, Socket.IO adapter scaling
Real-time
Socket.IO
Live attendance updates, scan result broadcasting to organizers
Authentication
JWT (HS256/RS256)
Stateless, easily scaled, standard across web and mobile
QR Generation
qrcode npm library
Lightweight, no external dependencies, fast encoding
Logging
Pino + pino-http
Structured logs, fast, built-in request correlation IDs
API Docs
Swagger/OpenAPI
Contract-first API design, auto-generated interactive docs
Testing
Vitest + Supertest
Fast unit tests, HTTP integration testing against real routes
Security
helmet, cors, express-rate-limit
Default-secure HTTP headers, CORS control, rate limiting
Payment Gateway
Paystack (Test Mode)
Industry-standard in Africa, comprehensive documentation, test environment

5. Architecture & Design
Architectural Pattern: Modular Monolith
The backend uses a modular monolith approach: one deployable application with clear domain modules and service boundaries. This allows rapid development while maintaining clean separation of concerns.
Core Architectural Layers
Layer
Description
Presentation
HTTP/REST endpoints, request validation (Zod), response formatting
Application
Controllers, service orchestration, business logic coordination
Business Logic
Domain services, validation rules, workflow processing
Data Access
Prisma ORM, repository pattern, query optimization, indexes
Cache Layer
Redis for duplicate prevention, rate limiting, session storage
Database
PostgreSQL for persistent, transactional data storage
Real-Time
Socket.IO for WebSocket connections and live updates
Integration
External services (Paystack, Email, Monitoring, etc.)


High-Level System Architecture

┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                                 │
├──────────────┬──────────────────┬──────────────────────────────┤
│ Web Browser  │  Mobile Apps     │  Event Staff Scanner (PWA)   │
│(React/Vue)   │ (iOS/Android)    │                              │
└──────┬───────┴────────┬─────────┴──────────────┬───────────────┘
       │                │                        │
       └────────────────┼────────────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │    HTTPS + TLS 1.2+            │
        │    WebSocket (WSS)             │
        │    Port 443 (HTTPS)            │
        │    WebSocket: /socket.io       │
        └───────────────┬────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │   EXPRESS.JS 5 API SERVER      │
        │   (Node.js 22 LTS)             │
        │   Port: 3000 (internal)        │
        │   Behind Load Balancer         │
        └───────────────┬────────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    ▼                   ▼                   ▼
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│MIDDLEWARE│  │ROUTE/CTRL    │  │SOCKET.IO     │
│          │  │              │  │SERVER        │
│• Auth    │  │• Controllers │  │              │
│• Validate│  │• Validation  │  │• Rooms       │
│• Limits  │  │• Handlers    │  │• Broadcasting│
│• Logging │  │• CORS        │  │• Updates     │
└────┬─────┘  └────────┬─────┘  └────────┬─────┘
     │                 │                 │
     └─────────────────┼─────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │  SERVICE LAYER              │
        │  • Auth Service             │
        │  • Event Service            │
        │  • Ticket Service           │
        │  • Check-In Service         │
        │  • Payment Service          │
        │  • Notification Service     │
        │  • Report Service           │
        └──────────────┬──────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
┌────────────┐  ┌──────────────┐  ┌──────────────┐
│PostgreSQL  │  │Redis         │  │External APIs │
│Database    │  │Cache & Locks │  │              │
│            │  │              │  │• Paystack    │
│• Users     │  │• Duplicate   │  │• Brevo Email │
│• Events    │  │  Prevention  │  │• Sentry      │
│• Tickets   │  │• Rate Limits │  │• DataDog     │
│• Check-ins │  │• Sessions    │  │              │
│• Payments  │  │              │  │              │
│• Audits    │  │              │  │              │
└────────────┘  └──────────────┘  └──────────────┘


Request Processing Flow
HTTP Request → Route → Validation (Zod) → Controller → Service → Repository/Prisma → Database Response
Controllers: Handle HTTP concerns only (request parsing, response formatting)
Services: Enforce business logic and core rules
Repositories: Manage database persistence via Prisma
Socket handlers: Reuse services for real-time events
Folder Structure
Path
Purpose
src/app.js
Express app configuration and middleware setup
src/server.js
HTTP server and Socket.IO initialization
src/config/
Environment variables, logger, Redis client, Swagger config
src/database/
Prisma client, schema, migrations, seed data
src/modules/auth/
Login, token refresh, RBAC middleware, identity
src/modules/events/
Event CRUD, status changes, queries
src/modules/tickets/
Ticket code upload, validation, QR generation
src/modules/checkins/
Scan verification, duplicate prevention, attendance records
src/modules/payments/
Paystack integration, transaction handling, invoice generation
src/modules/reports/
Attendance aggregates, exports, organizer dashboards
src/modules/notifications/
Reminder and confirmation delivery hooks
src/realtime/
Socket.IO event definitions, room management
src/middlewares/
Auth guards, validation, error handling, rate limiting
src/utils/
Shared helpers for IDs, dates, crypto, response formatting


Complete Project Directory Tree

eventnester-backend/
├── .github/workflows/
│   ├── ci.yml                    # Test, lint, build pipeline
│   ├── deploy.yml                # Deploy to staging/prod
│   └── codeql.yml                # Security scanning
│
├── .env.example                  # Environment variable template
├── .eslintrc.json                # Linting rules
├── .prettierrc                    # Code formatting
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Local dev stack (API+DB+Redis)
├── package.json                   # Dependencies & scripts
├── package-lock.json              # Locked versions
├── vitest.config.js               # Test configuration
├── README.md                       # Getting started guide
│
├── src/
│   ├── index.js                   # Entry point
│   ├── app.js                     # Express app setup
│   ├── server.js                  # HTTP/Socket.IO server
│   │
│   ├── config/
│   │   ├── index.js               # Config loader
│   │   ├── env.js                 # Environment validation
│   │   ├── logger.js              # Pino logger setup
│   │   ├── redis.js               # Redis client
│   │   └── swagger.js             # OpenAPI config
│   │
│   ├── database/
│   │   ├── schema.prisma          # Data model definition
│   │   ├── migrations/            # Database migrations
│   │   └── seed.js                # Test data seeding
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.middleware.js
│   │   │   ├── auth.routes.js
│   │   │   └── auth.schema.js     # Zod schemas
│   │   │
│   │   ├── events/
│   │   │   ├── event.controller.js
│   │   │   ├── event.service.js
│   │   │   ├── event.routes.js
│   │   │   ├── event.schema.js
│   │   │   └── __tests__/
│   │   │
│   │   ├── tickets/
│   │   │   ├── ticket.controller.js
│   │   │   ├── ticket.service.js
│   │   │   ├── qr.service.js      # QR generation/validation
│   │   │   ├── ticket.routes.js
│   │   │   └── ticket.schema.js
│   │   │
│   │   ├── checkins/
│   │   │   ├── checkin.controller.js
│   │   │   ├── checkin.service.js
│   │   │   ├── duplicate-detector.js # Duplicate prevention
│   │   │   ├── checkin.routes.js
│   │   │   └── checkin.schema.js
│   │   │
│   │   ├── payments/
│   │   │   ├── payment.controller.js
│   │   │   ├── payment.service.js
│   │   │   ├── paystack.service.js # Paystack integration
│   │   │   ├── webhook.handler.js
│   │   │   └── payment.routes.js
│   │   │
│   │   ├── notifications/
│   │   │   ├── notification.controller.js
│   │   │   ├── notification.service.js
│   │   │   ├── email.service.js    # Email abstraction
│   │   │   ├── brevo.service.js    # Brevo API client
│   │   │   ├── templates/          # HTML email templates
│   │   │   │   ├── qr-generated.html
│   │   │   │   ├── check-in-confirmation.html
│   │   │   │   └── event-reminder.html
│   │   │   └── notification.routes.js
│   │   │
│   │   ├── reports/
│   │   │   ├── report.controller.js
│   │   │   ├── report.service.js
│   │   │   ├── export.service.js   # CSV/Excel export
│   │   │   └── report.routes.js
│   │   │
│   │   └── admin/
│   │       ├── admin.controller.js
│   │       ├── admin.service.js
│   │       └── audit.service.js    # Audit trail logging
│   │
│   ├── realtime/
│   │   ├── socket.js               # Socket.IO setup
│   │   ├── events.js               # Event handlers
│   │   └── rooms.js                # Room management
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js
│   │   ├── rbac.middleware.js
│   │   ├── validation.middleware.js
│   │   ├── error.middleware.js
│   │   ├── logging.middleware.js
│   │   └── rate-limit.middleware.js
│   │
│   ├── integrations/
│   │   ├── paystack/
│   │   │   ├── client.js           # Paystack API client
│   │   │   └── webhook.js          # Webhook verification
│   │   │
│   │   ├── email/
│   │   │   ├── brevo.js            # Brevo email client
│   │   │   └── templates.js        # Template helpers
│   │   │
│   │   └── sentry/
│   │       └── client.js           # Error tracking
│   │
│   ├── utils/
│   │   ├── crypto.js               # Encryption helpers
│   │   ├── id-generator.js         # UUID generation
│   │   ├── response.js             # Standard responses
│   │   ├── error.js                # Custom errors
│   │   └── validators.js           # Custom validators
│   │
│   └── routes/
│       ├── index.js                # Main router
│       ├── v1.js                    # API v1 routes
│       └── health.js                # Health checks
│
├── tests/
│   ├── unit/                       # Unit tests
│   │   └── __tests__/
│   │
│   ├── integration/                # Integration tests
│   │   └── __tests__/
│   │
│   ├── e2e/                        # End-to-end tests
│   │   └── __tests__/
│   │
│   ├── fixtures/                   # Test data
│   │   └── *.json
│   │
│   └── setup.js                    # Test environment setup
│
├── docs/
│   ├── API.md                      # API documentation
│   ├── ARCHITECTURE.md             # Architecture guide
│   ├── DATABASE.md                 # Schema documentation
│   ├── DEPLOYMENT.md               # Deployment guide
│   ├── MONITORING.md               # Monitoring setup
│   └── TROUBLESHOOTING.md          # Common issues
│
├── scripts/
│   ├── db-migrate.sh               # Database migration
│   ├── db-seed.sh                  # Seed test data
│   ├── docker-build.sh             # Build Docker image
│   └── health-check.sh             # Health check script
│
└── infra/
    ├── docker/
    │   ├── Dockerfile              # Production build
    │   └── .dockerignore
    │
    └── k8s/                        # Kubernetes manifests (optional)
        ├── deployment.yaml
        ├── service.yaml
        └── configmap.yaml


6. API Specifications
API Design Principles
REST-first: Resources named after business nouns (events, tickets, scans)
Versioning: All routes prefixed with /api/v1
Validation-first: Zod validation before business logic
Consistent responses: {success, message, data, meta}
Pagination: Support page/limit or cursor-based pagination
Idempotency: QR generation and scan endpoints protected from retries
Documentation: Full OpenAPI spec kept in sync with implementation
Core API Endpoints
Authentication
Method
Endpoint
Description
POST
/api/v1/auth/register
Register organizer or staff account
POST
/api/v1/auth/login
Login and receive JWT token
POST
/api/v1/auth/refresh
Refresh expired access token
POST
/api/v1/auth/logout
Revoke tokens and end session


Events
Method
Endpoint
Description
POST
/api/v1/events
Create new event (requires organizer role)
GET
/api/v1/events/:eventId
Retrieve event details
GET
/api/v1/events
List events (filtered by user role)
PATCH
/api/v1/events/:eventId
Update event details
DELETE
/api/v1/events/:eventId
Delete event (soft delete)


Ticket Verification & QR Generation
Method
Endpoint
Description
POST
/api/v1/events/:eventId/ticket-codes
Upload/bulk-add valid ticket codes
POST
/api/v1/events/:eventId/verify
Verify ticket code and generate QR
GET
/api/v1/events/:eventId/qr/:tokenId
Retrieve QR code (as image or JSON)
POST
/api/v1/events/:eventId/validate-qr
Validate QR token (used by scanner)


Check-Ins & Scanning
Method
Endpoint
Description
POST
/api/v1/events/:eventId/scan
Scan and validate QR code (staff only)
GET
/api/v1/events/:eventId/checkins
Get list of check-ins for event
GET
/api/v1/events/:eventId/checkins/:checkInId
Get individual check-in details
POST
/api/v1/events/:eventId/checkins/:checkInId/undo
Undo a check-in (admin override)


Reports & Analytics
Method
Endpoint
Description
GET
/api/v1/events/:eventId/summary
Attendance summary and live counts
GET
/api/v1/events/:eventId/report
Generate detailed attendance report
GET
/api/v1/events/:eventId/export
Export attendance as CSV or Excel
GET
/api/v1/events/:eventId/analytics
Get peak times, conversion rates, etc.


Payment & Invoicing
Method
Endpoint
Description
POST
/api/v1/payments/initialize
Initialize Paystack payment for event
GET
/api/v1/payments/verify/:reference
Verify Paystack payment status
POST
/api/v1/payments/webhook
Receive Paystack webhook notifications
GET
/api/v1/payments/transactions
List payment transactions
GET
/api/v1/payments/invoice/:invoiceId
Retrieve invoice details

7. Database Schema & Data Model
Core Entities and Relationships
Entity
Purpose
Key Fields
User
Represents organizers, staff, and admins
id, name, email, passwordHash, role, status, createdAt, updatedAt
Event
Stores the event being managed
id, title, description, venue, startTime, endTime, status, ownerId, createdAt, updatedAt
EventStaffAssignment
Links staff to specific events
id, eventId, userId, permissionScope, active, assignedAt
TicketCode
Tracks issued verification codes
id, eventId, code, status, usedAt, attendeeEmail, attendeeName, createdAt
Registration
Represents an attendee with valid ticket
id, eventId, ticketCodeId, attendeeEmail, attendeeName, qrIssued, qrIssuedAt, status
QrToken
Stores signed QR payload details
id, registrationId, tokenHash, issuedAt, expiresAt, revokedAt, scanCount
CheckIn
Records every validation or entry
id, eventId, registrationId, staffId, scannedAt, result (VALID/DUPLICATE/INVALID), deviceInfo, ipAddress
Payment
Records Paystack transactions
id, eventId, userId, paystackReference, amount, currency, status, createdAt, paidAt
Invoice
Invoicing and billing records
id, eventId, paymentId, invoiceNumber, amount, issueDate, dueDate, status
Notification
Stores reminder and confirmation
id, recipient, channel, template, status, sentAt, readAt
AuditLog
Captures sensitive actions
id, actorId, action, entity, entityId, beforeSnapshot, afterSnapshot, createdAt


Key Database Constraints
Foreign keys enforced at database level
Unique constraints on email, ticket codes, event titles (within organizer)
Soft deletes for events, users, and registrations
Indexes on eventId, userId, tokenHash, createdAt for query performance
Timestamps (createdAt, updatedAt) on all entities
Check constraints on status enums (ACTIVE, COMPLETED, CANCELLED, etc.)
Cascade delete rules defined with caution (orphaned checkins must not occur)
8. Authentication & Authorization
Authentication Method: JWT (JSON Web Tokens)
Algorithm: HS256 (HMAC) for issuing, RS256 (RSA) for public verification if needed later
Access Token Lifetime: 15–30 minutes
Refresh Token Lifetime: 7 days (rotated on refresh)
Payload: {userId, email, role, iat, exp, jti}
Storage: Secure HttpOnly cookies (web) or secure storage (mobile)
Revocation: Tracked in Redis or database for logout
Token validation performed on every request via middleware
Role-Based Access Control (RBAC)
Role
Permissions
Attendee
Enter ticket code, view QR code, view event details, receive reminders
Event Staff
Sign in, scan QR codes, view assigned events, see live check-in results
Organizer
Create/edit events, upload ticket codes, manage staff, view attendance, export reports, process payments
Platform Admin
Oversee users, events, audit logs, platform config, undo operations, manage payments

Authorization Enforcement
Route-level middleware: @requireRole('organizer', 'admin')
Service-level checks: Verify user owns the event before modification
Event-scoped staff: Only assigned staff can scan for a specific event
Attendee flows: Code-driven with optional event-scoped validation
Audit log every authorization decision that could have security implications
Return 403 Forbidden for authorized users without permission
Return 401 Unauthorized for missing or invalid tokens
9. Core Workflows
Ticket Verification & QR Generation Flow
1. Organizer uploads valid ticket codes to event
2. Attendee submits ticket verification code via POST /api/v1/events/:eventId/verify
3. Backend validates code, creates Registration record
4. Backend generates cryptographically signed QR token
5. Token stored in QrToken table with expiry
6. QR code rendered and returned to attendee
7. Notification sent: "QR generated, valid until [time]"

QR Scan & Check-In Flow (Duplicate Prevention)
1. Event staff scans QR code via POST /api/v1/events/:eventId/scan
2. Backend acquires Redis lock on tokenHash
3. Backend decodes and validates token
4. Backend checks if QrToken already has scanCount > 0
5. If duplicate, return DUPLICATE and log audit event
6. If valid, write CheckIn record with result = VALID
7. Backend increments QrToken.scanCount and sets QrToken.revokedAt
8. Publish Socket.IO event to organizer dashboard
9. Return response: {success: true, result: "VALID", attendeeName}
10. Release Redis lock


10. Email Service Integration (Notifications)
Email Service Strategy
EventNester integrates email notifications for key event lifecycle moments. The backend abstracts email delivery through a service interface, allowing easy provider switching as needs scale.
Recommended Provider: Brevo (formerly Sendinblue)
Brevo is recommended as the primary email service provider for EventNester:
Free Tier: 300 emails/day (sufficient for MVP phase)
Excellent Deliverability: 99%+ inbox placement rates
Rich Features: Templates, SMTP relay, webhooks, analytics
Global Infrastructure: Servers in multiple regions for low latency
Compliance: GDPR, CCPA, CAN-SPAM compliant
Good Documentation: Comprehensive API and code examples
Affordable Upgrade Path: Seamless move from free to paid plans
No CC charges: Free tier never converts to paid without explicit action
Alternative Email Providers Comparison
Provider
Free Tier
Cost Model
Strengths
Weaknesses
Brevo
300/day
Pay-as-you-go
Great deliverability, templates
Dashboard crowded
Mailgun
5000/month
Per email after free
Excellent API, detailed logs
Free tier ends quickly
SendGrid
100/day
Per email after free
Industry standard, great docs
Very limited free tier
Resend
100/day
Per email after free
Modern React email builder
Newer, smaller community


Email Notification Events & Templates
Event
Recipient
Template Content
Trigger
Welcome
Attendee
Account created message, event link
POST /auth/register
QR Generated
Attendee
QR code image, event details, tips
POST /events/:id/verify (success)
Check-In Confirmation
Attendee
Attendance confirmed, schedule
POST /events/:id/scan (success)
Event Reminder
Attendee
24hr countdown, venue details
Scheduled: 24hrs before event
Payment Confirmation
Organizer
Receipt, amount, invoice link
Payment webhook (successful)
Event Report
Organizer
Attendance summary & analytics
Manual or scheduled post-event


Brevo Setup Instructions
1. Sign up for free account at https://www.brevo.com/
2. Create email templates in Brevo dashboard (or use pre-built templates)
3. Retrieve template IDs from Brevo dashboard
4. Get API key from Account Settings → API & Web Push
5. Store API key securely: export BREVO_API_KEY="xxx"
6. Store template IDs in environment: BREVO_TEMPLATE_QR_GENERATED=123
7. Configure sender email: BREVO_SENDER_EMAIL="noreply@eventnester.com"
8. Test email flow in sandbox mode before going live
9. Monitor email delivery stats and bounce rates in Brevo dashboard

11. Payment Gateway Integration (Paystack)
Paystack Integration Overview
EventNester uses Paystack (Test Mode) to handle event ticketing payments. The backend manages payment initialization, verification, and webhook processing.
Key Integration Points
Payment Initialization: Organizer initiates payment, backend generates Paystack link
Payment Verification: Frontend redirects after Paystack popup, backend verifies status
Webhook Handling: Paystack sends real-time updates, verify signature and update records
Invoice Generation: Create Invoice record after successful payment

Paystack Test Mode Configuration
Use Paystack Test Secret Key from Paystack Dashboard
All transactions simulate successful/failed payments
Test card details provided by Paystack for demo
Webhook test endpoint configured in environment
No real money transferred during development
Switch to production keys when deploying to live

Security Considerations
Paystack API key stored in environment variables only
Webhook signature verified using Paystack public key
Payment amounts recalculated server-side (never trust client amount)
Failed payments do not enable QR generation
Refunds handled through Paystack dashboard (backend logs audit trail)
Rate limiting on payment endpoints to prevent abuse
All payment data encrypted at rest in database

12. Non-Functional Requirements
Requirement
Specification
Performance
QR scan: < 200ms. Ticket upload (10k): < 5 min. Reports (5k): < 30s
Scalability
1000+ concurrent users. 100+ scans/sec. Horizontal scaling via read replicas and Redis clustering
Availability
99.5% uptime SLA. Health checks every 30s. Auto-recovery on crash. Backups every 6 hours
Reliability
Zero duplicate check-ins. Redis locks. Full audit trail. PostgreSQL ACID. Idempotent endpoints
Latency
P95: < 300ms. P99: < 500ms. Real-time socket updates: < 100ms broadcast
Data Integrity
Foreign keys, check constraints, soft deletes, READ COMMITTED isolation
Maintainability
Modular code, documented APIs, > 80% test coverage, CI/CD pipeline
Disaster Recovery
RTO: < 15 min. RPO: < 5 min. S3 backups. Automated failover

13. Security Requirements
Transport Security
HTTPS only (TLS 1.2+) for all production traffic
HSTS header (Strict-Transport-Security) enabled
Certificate pinning (mobile apps)
No HTTP fallback or upgrades
Secure WebSocket (WSS) for Socket.IO
Authentication Security
Passwords hashed with bcrypt (salt rounds ≥ 12)
JWT tokens signed with strong secret (≥ 32 bytes)
Access tokens short-lived (15–30 min)
Refresh tokens rotated on use
Token revocation tracked in Redis or database
No sensitive data in JWT payload
Rate limiting on login (max 5 attempts/min)
Account lockout after 5 failed login attempts
Data Protection
Sensitive fields encrypted at rest: passwords, tokens, payment refs
PII encrypted for GDPR compliance
Database encryption at rest (pgcrypto)
Backup encryption (AES-256)
No sensitive data in logs
Data retention policy: Delete inactive events after 1 year
GDPR data export endpoint for attendees
Input Validation & Error Handling
Zod validation on every request
Whitelist allowed characters for text inputs
File uploads: validate type and size
SQL injection: Use parameterized queries (Prisma ORM)
XSS prevention: HTML-encode output in JSON
CSRF protection: SameSite cookie attribute set to Strict
Rate limiting on all public endpoints
Content Security Policy (CSP) headers configured
No stack traces exposed to client
Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
14. Testing Strategy
Testing Levels
Level
Scope
Target
Unit
Pure functions, validation logic
> 80% of services and utils
Integration
HTTP routes + database + Redis
Critical workflows (verify, scan, report)
E2E
Full scenarios
All MVP flows, happy path + error cases
Load
Concurrent users, scan throughput
1000+ users, 100+ scans/sec
Security
OWASP Top 10, auth, authz
All auth flows, injection attacks, privilege escalation

Critical Test Scenarios
Organizer creates event with valid details
Organizer uploads 1000+ ticket codes via CSV
Attendee enters valid code → receives unique QR token
Staff scans QR → attendee marked checked in
Same QR scanned twice → duplicate warning (not re-admitted)
Invalid QR scanned → error response
Organizer initiates Paystack payment → payment verified → event unlocked
Organizer views live attendance dashboard → real-time count updates
Organizer exports attendance as CSV → includes all checked-in attendees
Staff member logs out → cannot scan anymore
Admin undoes a check-in → record marked as reversed
Database connection lost → API returns 503
Redis unavailable → duplicate prevention degrades gracefully
Concurrent scans of same QR → only one admits, others get duplicate
Load test: 1000 concurrent users → response times stay < 500ms

Tools & Framework
Unit Testing: Vitest (fast, ESM-native)
Integration Testing: Supertest (HTTP assertions)
Load Testing: Artillery or k6 (1000+ virtual users)
Mocking: Vitest mocks for external APIs
Test DB: PostgreSQL in Docker (spun up/down per suite)
Coverage: C8 or Istanbul (minimum 80% for service layer)
CI/CD: GitHub Actions (run tests on every PR)
15. Deployment & Operations
Containerization & Deployment
Docker image based on Node.js 22 LTS alpine
Multi-stage build: separate build and runtime stages
Environment variables via .env.example
Docker Compose for local development (API + PostgreSQL + Redis)
Kubernetes-ready (optional): Helm charts for scaling
Health endpoint: GET /health (returns 200 if DB and Redis OK)
Readiness endpoint: GET /ready (checks all dependencies)
Graceful shutdown: 30-second drain before SIGKILL
Key Commands
Command
Purpose
npm run dev
Start API in development mode (nodemon watch)
npm start
Start API in production mode
npm test
Run all tests (Vitest)
npm run migrate:deploy
Apply migrations (production-safe)
npm run seed
Populate database with test data
docker-compose up
Start local dev stack


Monitoring & Logging
Structured logging: Pino JSON format
Log aggregation: Stream logs to CloudWatch, Datadog, or similar
Request correlation: Every log includes x-correlation-id
Error tracking: Sentry or similar for exception monitoring
Metrics: Prometheus endpoint at /metrics
Uptime monitoring: External health checks every 60s
Alerting: Slack/PagerDuty for errors, high response times
Log retention: 30 days hot, 1 year in archive storage
16. Deliverables & Timeline
Phase 1: Foundation & Setup (Week 1, Days 1–2)
Project scaffold: Express, Prisma, Zod setup
Environment configuration (.env.example)
PostgreSQL schema with core entities
Redis client initialization
Logging setup (Pino)
Docker Compose for local dev
README with setup instructions
CI/CD pipeline (GitHub Actions)
Deliverable: Running API shell at http://localhost:3000/health
Phase 2: Authentication & Event Management (Week 1–2, Days 3–6)
JWT authentication (register, login, refresh, logout)
Role-based authorization middleware
Event CRUD endpoints
Ticket code upload/validation
QR token generation (signed JWT or hash)
OpenAPI/Swagger documentation
Unit tests for auth and event services
Deliverable: Organizer can create event + upload ticket codes
Phase 3: QR Scanning & Real-Time Updates (Week 2–3, Days 7–14)
QR scan endpoint with duplicate prevention (Redis locks)
Socket.IO real-time attendance updates
Check-in recording and status tracking
Attendance summary and reporting endpoints
CSV export functionality
Integration tests for scan workflow
Load test (100+ scans/second)
Deliverable: Staff can scan QR → organizer sees live updates
Phase 4: Paystack Integration & Polish (Week 3–4, Days 15–20)
Paystack payment initialization and verification
Webhook handling for payment notifications
Invoice generation and storage
Event unlock after successful payment
Security hardening (rate limiting, CORS, helmet)
Comprehensive test coverage (> 80%)
Performance optimization and caching
Complete API documentation
Operational guides (deployment, monitoring)
Deliverable: Production-ready API
17. Assumptions & Constraints
Assumptions
Frontend will consume API via documented OpenAPI spec
Mobile app will use same API with optional offline caching
Organizers trust Paystack for payment processing
Initial event volume: < 10,000 events/month
Average attendance: < 1,000 people/event
Peak concurrent users: 1,000 during event day
Ticket codes uploaded in CSV format
QR codes displayed on mobile devices
Events hosted in Nigeria (NGN currency for Paystack)
Staff devices have internet connectivity
Constraints
4-week capstone deadline: MVP scope only
Node.js/Express limited by team expertise
Single database instance (no sharding)
Paystack test mode only
No video streaming, hardware integration, or AI/ML
Budget: No paid SaaS dependencies
Small backend team (parallel development with design + frontend)
Manual integration tests + automated tests
GDPR-compliant but not PCI-DSS certified
18. Glossary & Key References
Key Terms
Attendee: A person who registers for an event using a valid ticket code. Check-In: The act of scanning a QR code at the venue to mark attendance. Event: A scheduled gathering with registered attendees. Organizer: A user who creates events and manages attendance. QR Token: A cryptographically signed payload for secure verification. Ticket Code: A unique verification code provided by the organizer. Staff: An event team member authorized to scan QR codes. Duplicate Scan: An attempt to check in the same QR code twice (not permitted).
