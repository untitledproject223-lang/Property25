# Property25 — coworker setup & continue-from-here

Paste this onto your PC and follow it top to bottom. When you’re done, you’ll have the same repo, local run, and deploy understanding as the rest of the team.

**Do not use Azure.** Live stack is Midpoint (UI) + Render (API) + Neon (DB) only.

---

## Links you need

| What | URL |
|------|-----|
| Live app | https://midpointblue.co.za/real/#/login |
| Live API | https://property25.onrender.com |
| API health | https://property25.onrender.com/api/health |
| GitHub repo | https://github.com/untitledproject223-lang/Property25 |
| Deploy detail | [docs/DEPLOY.md](./DEPLOY.md) |
| Neon console | https://console.neon.tech *(ask lead for access)* |
| Render dashboard | https://dashboard.render.com *(ask lead for access)* |

Ask the team lead (in chat / privately — never commit these):

- Neon `DATABASE_URL` (pooled connection string)
- Same `JWT_SECRET` as production **or** a local-only secret if you’re only hitting local API
- Demo / test logins if you need them

---

## 0. Install on your PC (once)

You need:

- **Git**
- **Node.js 20+** (22 is fine)
- A code editor (Cursor / VS Code)

Optional but useful: GitHub CLI (`gh`), FileZilla (only if Actions is down and you must FTP by hand).

---

## 1. Clone and install

```bash
git clone https://github.com/untitledproject223-lang/Property25.git
cd Property25

git checkout main
git pull origin main

npm install
cd server
npm install
cd ..
```

---

## 2. Create env files (do not commit these)

### `server/.env`

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://…   # paste Neon pooled URL from lead
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=…                  # ask lead
APP_PUBLIC_URL=http://localhost:5173
```

### Root `.env.local` (optional — local UI → local API)

```env
VITE_API_URL=http://localhost:4000
```

### Root `.env.production` (for production builds)

```env
VITE_API_URL=https://property25.onrender.com
```

**Never** commit `.env`, `server/.env`, FTP passwords, or Neon URLs.

---

## 3. Database migrations (important)

Neon is the shared source of truth. After pulling code that adds files under `server/src/db/migrations/`, run:

```bash
cd server
npm run db:migrate
```

Render is configured to run migrations on **API start** (`npm run db:migrate && npm start`). If you still see schema errors on live, run migrate locally against the same Neon DB (with lead approval) or check Render logs.

### Real incident we already hit

Symptom on Midpoint:

> `API: Internal server error (showing fallback)`  
> org name shows like **DEMO AGENCY**

Cause: code queried `apartments.deposit_balance` before migration `007_deposit_balance.sql` was applied.

Fix:

```bash
cd server
npm run db:migrate
```

Then hard-refresh the live site (`Ctrl+Shift+R`).

---

## 4. Run locally

Two terminals from repo root:

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — UI
npm run dev
```

Open the Vite URL (usually http://localhost:5173).

Smoke checks:

1. Login works
2. No red “API: … (showing fallback)” in the top bar
3. https://property25.onrender.com/api/health returns `"status":"ok"` when testing against live API

---

## 5. How we ship (what the lead has been doing)

There are **two** live pieces:

| Piece | Host | How it updates |
|-------|------|----------------|
| API | Render (`property25.onrender.com`) | Push/merge to `main` → auto deploy |
| UI | Afrihost cPanel (`midpointblue.co.za/real`) | Push/merge UI changes to `main` → **GitHub Action** builds + FTP |

### Your normal loop

```bash
git checkout main
git pull origin main
git checkout -b feature/short-description

# …code…

git add .
git status    # refuse .env / secrets
git commit -m "Why this change exists"
git push -u origin HEAD
```

1. Open a PR into `main` on GitHub  
2. After merge:
   - API: wait for Render (a few minutes)
   - UI: wait for **Actions → Deploy Midpoint frontend** (green)
3. Share / test: https://midpointblue.co.za/real/#/login (hard-refresh)

Docs-only commits may **skip** the Midpoint Action (path filter). To force UI deploy:

GitHub → **Actions** → **Deploy Midpoint frontend** → **Run workflow**

Full FTP / fallback steps: [docs/DEPLOY.md](./DEPLOY.md)

---

## 6. What not to do

| Don’t | Why |
|-------|-----|
| Deploy to Azure | Explicitly out of scope (work account) |
| Commit `.env` / FTP password | Rotate secrets if it happens |
| Push straight to `main` without review (unless agreed) | Prefer PR |
| Assume `git push` alone updated Midpoint | UI needs the Action (or manual FTP) |
| Skip `db:migrate` after new SQL migrations | Dashboard/API 500s + fallback UI |

---

## 7. Quick debug cheatsheet

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Red “API: Internal server error (showing fallback)” | API 500 (often missing migration / bad query) | Check Render logs; run `cd server && npm run db:migrate`; hard-refresh |
| Site loads, login fails | API down or wrong `VITE_API_URL` | Hit `/api/health`; confirm build uses Render URL |
| Midpoint UI old after merge | Action not run / failed | Actions tab; **Run workflow** if needed |
| Landlord can’t see an application | App has no `apartment_id` | Landlord list only shows apps on their units |
| Invoice “Attach to maintenance ticket” empty | Ticket not **Conditional (tenant pays / split)** | Only those tickets appear in the dropdown |

---

## 8. Repo map (short)

```
Property25/
  src/                 React UI (Vite)
  website/             Production static build output (base /real/)
  server/              Express API
  server/src/db/migrations/   Neon SQL migrations
  .github/workflows/   Midpoint FTP deploy Action
  docs/DEPLOY.md       Deploy manual
  docs/COWORKER-SETUP.md  ← this file
```

---

## 9. Done checklist (send this back in chat)

When you’re set up, reply with:

- [ ] Cloned `untitledproject223-lang/Property25` on `main`
- [ ] `npm install` (root + `server`) done
- [ ] `server/.env` filled (DATABASE_URL + JWT from lead)
- [ ] `npm run db:migrate` succeeded
- [ ] `npm run dev:api` + `npm run dev` work locally
- [ ] Can open live app https://midpointblue.co.za/real/#/login
- [ ] Read [docs/DEPLOY.md](./DEPLOY.md)

Then pick a task / branch and we continue from there.
