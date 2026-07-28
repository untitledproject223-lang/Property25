# Property25 API

Stable Express + TypeScript backend connected to **Neon Postgres**.

## Quick start

1. Create a Neon project at https://console.neon.tech  
2. Copy the **pooled** connection string  
3. Configure env:

```bash
cd server
cp .env.example .env
# paste DATABASE_URL into .env
```

4. Install, migrate, seed, run:

```bash
npm install
npm run db:setup
npm run dev
```

API: `http://localhost:4000`  
Health: `GET http://localhost:4000/api/health`

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/login` | `{ email, password }` → JWT |
| GET | `/api/auth/me` | Bearer token |

Demo login: `admin@demo-agency.test` / `Demo1234!`

Protected routes require: `Authorization: Bearer <token>`

CORS allows localhost and `https://midpointblue.co.za`.

## Main endpoints

| Method | Path | Auth header |
|--------|------|-------------|
| GET | `/api/health` | — |
| GET/POST | `/api/orgs` | — |
| GET | `/api/dashboard` | `X-Org-Id` |
| GET/POST | `/api/buildings` | `X-Org-Id` |
| GET/POST | `/api/landlords` | `X-Org-Id` |
| GET/POST | `/api/apartments` | `X-Org-Id` |
| GET/POST | `/api/tenants` | `X-Org-Id` |
| GET/POST/PATCH | `/api/applications` | `X-Org-Id` |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch mode |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:seed` | Demo agency + sample data |
| `npm run db:setup` | Migrate + seed |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |

## Notes

- Neon is the source of truth for structured data.
- MongoDB (files / screening JSON) can be added next without changing Neon schemas.
- Auth/JWT is stubbed as `X-Org-Id` for Phase 1 foundation — replace with session later.
