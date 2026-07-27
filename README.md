# QPass Backend

QR Code-Based Event Attendance & Ticket Verification System.

## Tech Stack

- **Runtime:** Node.js 22 LTS
- **Framework:** Express.js 5.x (ES Modules)
- **Database:** PostgreSQL 15+ with Prisma ORM
- **Cache:** Redis 7+
- **Real-time:** Socket.IO
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest + Supertest
- **Email:** Nodemailer
- **Payments:** Paystack (Test Mode)

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

## Quick Start

```bash
git clone https://github.com/EventNester/QPass-Backend.git
cd QPass-Backend
npm install
cp .env.example .env    # edit with your config
docker compose up -d    # starts Postgres + Redis
npm run migrate         # run database migrations
npm run dev             # start dev server at http://localhost:3000
```

> `npm install` automatically runs `prisma generate` via the `prepare` script.

### Environment Variables

Required in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/qpass?schema=public"
JWT_SECRET=your_secret_key_min_32_bytes_long_here
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_bytes
```

The default Docker Compose maps Postgres to port `5433` and Redis to `6380` on the host.

## API Documentation

**[Full API Reference →](./docs/QPASS_API_DOC.md)**

All 39 endpoints across 11 modules are documented with request/response examples, auth requirements, and validation schemas.

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

## Project Structure

```
src/
├── app.js              # Express app setup
├── server.js           # HTTP server, bootstrap, graceful shutdown
├── config/             # Configuration & environment validation
├── database/           # Prisma schema, client, seed, migrations
├── modules/            # Domain modules (controller → service → routes → schema)
│   ├── auth/           # Authentication & authorization
│   ├── checkins/       # QR scan & check-in tracking
│   ├── events/         # Event CRUD & lifecycle
│   ├── tickets/        # Ticket codes & QR generation
│   ├── payments/       # Paystack integration
│   ├── notifications/  # Email notifications
│   ├── reports/        # Analytics & exports
│   └── admin/          # Admin operations & audit logs
├── integrations/       # External services (Paystack, Nodemailer, Sentry)
├── middlewares/        # Express middlewares (logging, rate-limit, RBAC)
├── realtime/           # Socket.IO handlers & rooms
├── routes/             # API route registration
└── utils/              # Utilities (crypto, errors, response, validators)
```

## Docker

```bash
docker compose up -d              # start services
docker compose up --build -d      # rebuild and start
docker compose down               # stop services
docker compose down -v            # stop and remove volumes
```

## Database

The Prisma schema is at `src/database/schema.prisma`. All Prisma commands use `--schema=./src/database/schema.prisma`.

```bash
npm run generate       # generate Prisma client
npm run migrate        # create migration
npm run migrate:prod   # deploy migrations (production)
npm run migrate:reset  # reset database
npm run studio         # open Prisma Studio
```

## Testing

```bash
npm test               # watch mode
npm run test:run       # single run
npm run test:coverage  # with coverage
```

## Deployment

1. Set production environment variables
2. Run `npm run migrate:prod`
3. Start with `npm start`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

ISC
