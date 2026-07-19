# EventNester Backend

QR Code-Based Event Attendance & Ticket Verification System

## Tech Stack

- **Runtime:** Node.js 22 LTS
- **Framework:** Express.js 5.x
- **Module System:** ES Modules
- **Database:** PostgreSQL 15+ with Prisma ORM
- **Cache:** Redis 7+
- **Real-time:** Socket.IO
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest + Supertest
- **Email:** Brevo
- **Payments:** Paystack
- **Error Tracking:** Sentry

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/EventNester/EventNester-backend.git
cd EventNester-backend
npm install
```

`npm install` automatically runs `prisma generate` via the `prepare` script.

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration. Required variables:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/event_nester?schema=public"
JWT_SECRET=your_secret_key_min_32_bytes_long_here
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_bytes
```

> **Note:** The default Docker Compose maps Postgres to port `5433` and Redis to port `6380` on your host to avoid conflicts with locally installed instances. Update your `.env` accordingly.

### 3. Start services with Docker

```bash
docker compose up -d
```

This starts:
- PostgreSQL on host port `5433` (container port `5432`)
- Redis on host port `6380` (container port `6379`)

### 4. Run database migrations

```bash
npm run migrate
```

### 5. Start development server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm run generate` | Generate Prisma client |
| `npm run migrate` | Run database migrations |
| `npm run migrate:prod` | Deploy migrations (production) |
| `npm run migrate:reset` | Reset database |
| `npm run seed` | Seed database |
| `npm run studio` | Open Prisma Studio |
| `npm test` | Run tests (watch mode) |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run docs` | Generate Swagger docs |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check (verifies DB connection) |

> Additional endpoints will be available as modules are implemented. Swagger documentation will be served at `/api-docs` when enabled.

## Project Structure

```
src/
├── app.js              # Express app setup
├── server.js           # HTTP server, bootstrap, graceful shutdown
├── config/             # Configuration & environment validation
├── database/           # Prisma schema, client, seed, migrations
├── modules/            # Domain modules (controller/service/routes/schema)
│   ├── auth/           # Authentication & authorization
│   ├── events/         # Event management
│   ├── tickets/        # Ticket codes & QR generation
│   ├── checkins/       # Check-in tracking & verification
│   ├── payments/       # Paystack integration
│   ├── notifications/  # Email notifications (Brevo)
│   ├── reports/        # Analytics & reports
│   └── admin/          # Admin operations & audit logs
├── integrations/       # External services (Paystack, Brevo, Sentry)
├── middlewares/        # Express middlewares (auth, RBAC, validation, error)
├── realtime/           # Socket.IO handlers & rooms
├── routes/             # API route registration
└── utils/              # Utility functions (crypto, errors, validators)
```

## Docker

```bash
# Start services
docker compose up -d

# Rebuild and start
docker compose up --build -d

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v
```

## Database

The Prisma schema is located at `src/database/schema.prisma` (not the default `./prisma/schema.prisma`). All Prisma commands use `--schema=./src/database/schema.prisma`.

```bash
# Generate Prisma client
npm run generate

# Create migration
npm run migrate

# Deploy migrations (production)
npm run migrate:prod

# Reset database
npm run migrate:reset

# Open Prisma Studio
npm run studio
```

## Testing

```bash
# Run all tests (watch mode)
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

## Deployment

1. Set production environment variables
2. Run `npm run migrate:prod`
3. Start with `npm start`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

ISC
