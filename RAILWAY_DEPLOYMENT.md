# Deploying QPass Backend to Railway

Step-by-step guide to deploy this repo (Node.js 22 / Express 5 / Prisma / PostgreSQL / Redis / Socket.IO) to Railway.

**Estimated time:** 20–30 minutes

---

## 0. Prerequisites

- A GitHub account and the repo pushed to GitHub.
- A Railway account (free tier works: sign up at [railway.com](https://railway.com) — click "Login with GitHub").
- The `railway` CLI is **optional**; everything below is done from the Railway dashboard.

---

## 1. Repo fixes (already applied in this repo)

The Dockerfile and packaging have been fixed so the Railway build succeeds out of the box. The following are already committed/added:

1. `prisma` moved from `devDependencies` to `dependencies` in `package.json` (lockfile updated).
2. `Dockerfile` now runs `npx prisma generate --schema=./src/database/schema.prisma`.
3. `.dockerignore` added (excludes `node_modules`, `.git`, `.env`, etc.) so the build context stays small.
4. `railway.json` added — sets the start command (`migrate + start`) and `/health` healthcheck (see Step 6).

> **Why this matters (background, in case these are ever reverted):**

> 1. The Dockerfile runs `npm ci --omit=dev`. This triggers the `prepare` script in `package.json`, which runs `prisma generate --schema=./src/database/schema.prisma`. But the `prisma` CLI used to be a `devDependency`, so `--omit=dev` never installed it → the install step failed.
> 2. The Dockerfile used to run `npx prisma generate` **without** `--schema=./src/database/schema.prisma`. Prisma looks for `./prisma/schema.prisma` by default, but this repo's schema lives at `src/database/schema.prisma` → "Could not find a Prisma schema" error.
> 3. `docs/swagger.json` wasn't copied into the image, so `/api-docs` served empty docs — the Dockerfile now copies it.

> If you ever revert these changes, re-apply them before deploying.

---

## 2. Create the Railway project and connect GitHub

1. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**.
2. Authorize Railway to access GitHub, pick the repo, and choose the branch to deploy (e.g. `main`).
3. Railway detects the `Dockerfile` and starts the first build. **It will fail on this first run** (env vars aren't set yet, plus the build depends on the Step 1 fixes). That's expected — keep going.

---

## 3. Add PostgreSQL (gets you `DATABASE_URL`)

1. In your new project, click **New** → **Database** → **Add PostgreSQL** (or **New** → **Add a plugin** → **PostgreSQL**).
2. Railway provisions a Postgres instance and auto-injects `DATABASE_URL` into your web service. No action needed — the app reads `DATABASE_URL` directly via Prisma.

> The app does **not** read `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, or `DB_NAME` at runtime — only `DATABASE_URL` matters. Ignore those.

---

## 4. Add Redis

1. **New** → **Database** → **Add Redis** (or **Add a plugin** → **Redis**).
2. Railway injects a `REDIS_URL` like `redis://default:<password>@<host>:<port>`.

**Important:** this app does **not** read `REDIS_URL`. It reads four separate variables (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DATABASE`). Split the URL:

| URL part              | Railway variable      |
|-----------------------|-----------------------|
| `<host>`              | `REDIS_HOST`          |
| `<port>` (usually 6379)| `REDIS_PORT`          |
| `<password>`          | `REDIS_PASSWORD`      |
| `0`                   | `REDIS_DATABASE`      |

> Redis is **optional** for a single-replica deploy: if it can't connect, Socket.IO falls back to an in-memory adapter and the `/health` endpoint reports Redis as `degraded`, but the API still runs. Add it if you plan to use multiple replicas or need cross-replica Socket.IO rooms.

---

## 5. Configure environment variables

Open your web service → **Variables** and add:

### Required (app refuses to start without these)

| Variable              | Value |
|-----------------------|-------|
| `DATABASE_URL`        | Injected automatically by the Postgres plugin |
| `JWT_SECRET`          | Random string ≥ 32 chars (generate one, see below) |
| `JWT_REFRESH_SECRET`  | Random string ≥ 32 chars (different from `JWT_SECRET`) |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> The Zod env validator (`src/config/env.js`) enforces `JWT_SECRET`/`JWT_REFRESH_SECRET` minimum length 32 and requires `DATABASE_URL`. Startup exits if they're wrong.

### Recommended for a working production instance

| Variable              | Value |
|-----------------------|-------|
| `NODE_ENV`            | `production` |
| `FRONTEND_URL`        | Your frontend origin (e.g. `https://qpass.vercel.app`). Used to build password-reset links; the code **throws if missing in production**. |
| `CORS_ORIGIN`         | Your frontend origin (defaults to `*` — lock it down) |
| `SOCKET_CORS_ORIGIN`  | Same as `CORS_ORIGIN`, for Socket.IO |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DATABASE` | From Step 4 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | SMTP or Brevo credentials — see the Email setup section |
| `BREVO_SENDER_EMAIL`  | Verified sender shown in the `From` header |
| `BREVO_SENDER_NAME`   | Optional, defaults to `QPass` |

### Extra / safe to skip

| Variable | Why you can skip it |
|----------|---------------------|
| `PORT` | Railway sets this automatically; the app defaults to 3000 |
| `LOG_LEVEL` | Defaults to `info` |
| `SWAGGER_ENABLED` | Defaults to `true` — keep it on to get `/api-docs` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Not read at runtime; only `DATABASE_URL` is used |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` | Defined in the env schema but **no code reads them yet** (payments module isn't implemented). Add them later when you wire up Paystack. |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | No Sentry integration code exists in this repo; purely optional placeholders |
| `SMTP_SECURE` | Not read by the email code (it uses port 587/STARTTLS) |
| `SMTP_FROM` | Not read — the `From` address is built from `BREVO_SENDER_NAME` + `BREVO_SENDER_EMAIL` |
| `BREVO_SMTP_KEY` | **Not read by the code.** `src/modules/notifications/email.service.js` reads `BREVO_API_KEY` / `SMTP_PASS` instead — see Email setup |
| `UPLOAD_DIR` | Defaults to `uploads`. Railway's filesystem is **ephemeral** — see the uploads note in Troubleshooting |
| `USE_ETHEREAL`, `TEST_REAL_SMTP` | Test-only toggles; leave unset |

---

## 6. Run migrations on deploy

The app creates tables via Prisma migrations. The migrations live at `src/database/migrations` and use the `--schema` flag, so run them with the npm script.

In your service → **Settings** → **Deploy** → **Start command**, set:

```bash
sh -c "npm run migrate:prod && npm start"
```

This runs `prisma migrate deploy --schema=./src/database/schema.prisma` before starting `node src/server.js` on every deploy.

> Requires the Step 1 fix — `prisma migrate deploy` needs the Prisma CLI, which is only in the image if `prisma` is in `dependencies`.

A `railway.json` is **already committed at the repo root** that does this for you (build via Dockerfile, `sh -c "npm run migrate:prod && npm start"`, `/health` healthcheck). If it's present, you can skip setting the start command in the UI. (If you'd rather manage it in the dashboard instead, delete `railway.json` and set the start command manually.)

---

## 7. Trigger the deploy

1. Make sure the Step 1 fixes and all variables are saved.
2. Go to the **Deployments** tab of the service and click **Redeploy**.
3. Watch the build logs. Once the container starts, you should see:

```
PostgreSQL connected
Redis client connected
QPass API running on 3000
```

(Redis client messages are informational — the server still boots if Redis is down.)

---

## 8. Verify the deployment

- **Health check:** open `https://<your-service>.up.railway.app/health` — expect `200` with `{"status":"healthy","checks":{"database":"ok","redis":"ok"}}`. If Redis is absent, it returns `503` with `redis: "unavailable"` (that's expected).
- **Swagger docs:** open `https://<your-service>.up.railway.app/api-docs`.
- **Auth smoke test:** register a user via `POST /api/v1/auth/register` and confirm the confirmation/password-reset emails arrive (see Email setup below).
- Optional initial data: run the seeder once via the service's **Run command** (`npm run seed`) if you want demo data.

---

## 9. Email setup (SMTP and/or Brevo)

All emails flow through `src/modules/notifications/email.service.js`. If no SMTP/Brevo credentials are configured, the code **falls back to Ethereal** (a fake inbox) — messages log as "sent" but are never delivered. To send real email in production, configure **either** of the options below.

The `From` header is always built as:

```
<BREVO_SENDER_NAME> <<BREVO_SENDER_EMAIL>>
```

So always set `BREVO_SENDER_EMAIL` (and `BREVO_SENDER_NAME` unless you want "QPass").

### Option A — Gmail SMTP (quickest, fine for testing)

1. Use a Gmail account.
2. Turn on **2-Step Verification**: [myaccount.google.com](https://myaccount.google.com) → **Security** → **2-Step Verification** → follow the prompts. (App passwords require 2FA to be enabled.)
3. Create an app password: **Security** → **2-Step Verification** → **App passwords** → name it `qpass` → copy the generated 16-character password (spaces are fine).
4. Add these variables in Railway:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=<the 16-char app password>
BREVO_SENDER_EMAIL=your-email@gmail.com
BREVO_SENDER_NAME=QPass
```

Notes:
- Do **not** use your normal Gmail password in `SMTP_PASS` — Gmail rejects it. Use the app password.
- Gmail caps ~500 emails/day and the sender will be your Gmail address.

### Option B — Brevo (recommended for a real product, 300 free emails/day)

1. Sign up at [brevo.com](https://www.brevo.com) (free tier available).
2. **Verify a sender** (required before you can send):
   - Dashboard → **Senders & IP** → **Senders** → **Add a sender**.
   - Enter e.g. `noreply@yourdomain.com` → Brevo emails a 6-digit code to that inbox → enter it to verify.
3. **Get your SMTP credentials**:
   - Click your profile → **Settings** → **SMTP & API** → **SMTP** tab.
   - Copy the **SMTP login** — it looks like `7xxxxxx@smtp-brevo.com`. This is your **username**, not your email.
   - Click **Generate a new SMTP key**, name it `qpass-railway`, pick a variant/expiry, then **copy the key immediately — it is shown only once** (starts with `xsmtpsib-`).
4. Add these variables in Railway:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your SMTP login, e.g. 7xxxxxx@smtp-brevo.com>
SMTP_PASS=<your SMTP key, e.g. xsmtpsib-...>
BREVO_SENDER_EMAIL=<your verified sender, e.g. noreply@yourdomain.com>
BREVO_SENDER_NAME=QPass
```

**Brevo gotchas specific to this repo:**
- Brevo requires an **SMTP key** as the SMTP password — not an API key (`xkeysib-...`) and not your account password. Use `xsmtpsib-...`.
- The **SMTP login** (`xxx@smtp-brevo.com`) is a technical username — never use it as the `From` address. That's why we set the verified `BREVO_SENDER_EMAIL` separately.
- The repo's `.env`/`.env.example` mention `BREVO_SMTP_KEY`, but the code in `src/modules/notifications/email.service.js` actually reads `SMTP_PASS` and `BREVO_API_KEY`. The `SMTP_*` mapping above is the reliable path. (Setting only `BREVO_API_KEY=<SMTP key>` + `BREVO_SENDER_EMAIL` can only authenticate if your sender happens to equal your SMTP login, which Brevo then forbids as the From address — avoid it.)

### Verify email works

Trigger a password reset (`POST /api/v1/auth/forgot-password`) or register a user and confirm the message arrives. Check the service logs for `Email sent successfully` with a masked recipient, or a `FAILED` notification if SMTP auth/sender verification is wrong (look for `535 5.7.8 Authentication failed` → wrong SMTP login/key).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with "prisma: not found" or "Could not find a Prisma schema" | Apply Step 1 (move `prisma` to `dependencies`, add `--schema` to Dockerfile) and redeploy |
| App exits immediately on deploy | Check logs for "Invalid environment variables" — `DATABASE_URL`, `JWT_SECRET`, or `JWT_REFRESH_SECRET` are missing/short |
| `/health` returns 503 | Database or Redis unreachable. DB = wrong `DATABASE_URL`; Redis = check the Step 4 variable mapping (the app ignores `REDIS_URL`) |
| Password reset email never arrives | `FRONTEND_URL` not set, or SMTP/Brevo not configured (Ethereal fallback) |
| `535 Authentication failed` | Wrong SMTP login/password. For Brevo use the SMTP login + SMTP key; for Gmail use an app password, not the account password |
| Uploads disappear after redeploy | Railway's filesystem is ephemeral. Files saved to `uploads/` are lost on restart. For persistence, add a **Volume** mounted at `/app/uploads` (and set `UPLOAD_DIR` if you relocate it, e.g. `/tmp/uploads` for scratch) |
| Swagger not loading | `SWAGGER_ENABLED` set to `false`, or you're on `/api-docs` instead of `/api-docs/` |

---

## Quick reference

**Start command:** `sh -c "npm run migrate:prod && npm start"`

**Minimum viable variable set:**

```
NODE_ENV=production
DATABASE_URL=<from Railway Postgres>
JWT_SECRET=<random ≥32 chars>
JWT_REFRESH_SECRET=<random ≥32 chars>
FRONTEND_URL=https://your-frontend.example
CORS_ORIGIN=https://your-frontend.example
SOCKET_CORS_ORIGIN=https://your-frontend.example
# + email (SMTP or Brevo) and Redis vars if used
```
