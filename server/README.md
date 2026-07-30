# Property25 API

Stable Express + TypeScript backend connected to **Neon Postgres**.

## Quick start

1. Create a Neon project at https://console.neon.tech  
2. Copy the **pooled** connection string  
3. Configure env:

```bash
cd server
cp .env.example .env
# paste DATABASE_URL and JWT_SECRET into .env
```

4. Install, migrate, run:

```bash
npm install
npm run db:migrate
npm run dev
```

API: `http://localhost:4000`  
Health: `GET http://localhost:4000/api/health`

Create the first agency user via SQL or `npm run db:seed` (optional sample data for local testing only).

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/login` | `{ email, password }` → JWT |
| GET | `/api/auth/me` | Bearer token |

Protected routes require: `Authorization: Bearer <token>`

CORS allows localhost and `https://midpointblue.co.za`.

## Main endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | — |
| GET/POST | `/api/orgs` | Bearer |
| GET | `/api/dashboard` | Bearer |
| GET/POST | `/api/buildings` | Bearer |
| GET/POST | `/api/landlords` | Bearer |
| GET/POST | `/api/apartments` | Bearer |
| GET/POST | `/api/tenants` | Bearer |
| GET/POST/PATCH | `/api/applications` | Bearer |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch mode |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:seed` | Optional sample agency (local testing) |
| `npm run db:setup` | Migrate + optional seed |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |

## Notes

- Neon is the source of truth for structured data.
- MongoDB (files / screening JSON) can be added next without changing Neon schemas.
