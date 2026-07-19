# EventNester Backend

QR Code-Based Event Attendance & Ticket Verification System

## Tech Stack

- **Runtime:** Node.js 22 LTS
- **Framework:** Express.js 5.x
- **Database:** PostgreSQL 15+ with Prisma ORM
- **Cache:** Redis
- **Real-time:** Socket.IO
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest + Supertest

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

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration. Required variables:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/event_nester?schema=public"
JWT_SECRET=your_secret_key_min_32_bytes_long_here
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_bytes
```

### 3. Start services with Docker

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

### 4. Run database migrations

```bash
npm run migrate
```

### 5. Start development server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /ready` | Readiness check |
| `GET /api-docs` | Swagger documentation |
| `GET /api/v1/health` | API health check |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run migrate` | Run database migrations |
| `npm run migrate:prod` | Deploy migrations (production) |
| `npm run migrate:reset` | Reset database |
| `npm run seed` | Seed database |
| `npm run studio` | Open Prisma Studio |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run docs` | Generate Swagger docs |

## Project Structure

```
src/
├── config/          # Configuration files
├── database/        # Prisma schema and client
├── modules/         # Domain modules
│   ├── auth/        # Authentication
│   ├── events/      # Event management
│   ├── tickets/     # Ticket codes & QR
│   ├── checkins/    # Check-in tracking
│   ├── payments/    # Paystack integration
│   ├── notifications/ # Email notifications
│   ├── reports/     # Analytics & reports
│   └── admin/       # Admin operations
├── integrations/    # External services
├── middlewares/     # Express middlewares
├── realtime/        # Socket.IO handlers
├── routes/          # API routes
└── utils/           # Utility functions
```

## Docker

### Build and run

```bash
docker-compose up --build
```

### Stop services

```bash
docker-compose down
```

### Stop and remove volumes

```bash
docker-compose down -v
```

## Testing

```bash
# Run all tests
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

## Database

### Generate Prisma client

```bash
npm run generate
```

### Create migration

```bash
npm run migrate -- --name migration_name
```

### Reset database

```bash
npm run migrate:reset
```

### Open Prisma Studio

```bash
npm run studio
```

## Deployment

1. Set production environment variables
2. Run `npm run migrate:prod`
3. Start with `npm start`

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and lint
4. Submit a pull request

## License

ISC
