# Property25 — team deploy manual

How to ship code from your laptop to GitHub, the API, and the live app the team uses.

| What | URL |
|------|-----|
| **Live app (share this)** | https://midpointblue.co.za/real/#/login |
| **API** | https://property25.onrender.com |
| **Repo** | https://github.com/untitledproject223-lang/Property25 |

---

## Mental model (read this once)

There are **two** production pieces. They do **not** update the same way.

```
Your laptop
    │
    ├─ git push ──────────────────► GitHub (main / PR)
    │                                    │
    │                                    ▼
    │                              Render API auto-deploys
    │                              (property25.onrender.com)
    │
    └─ npm run build:website
         + FTP upload ────────────► Afrihost cPanel
                                    (midpointblue.co.za/real/)
```

| Piece | Host | Updates when… |
|-------|------|----------------|
| Backend API | Render | You merge/push to `main` (auto) |
| Frontend UI | Midpoint cPanel | Someone **rebuilds** and **FTP uploads** `website/` |

**cPanel does not pull from GitHub.** Pushing a branch alone will **not** change https://midpointblue.co.za/real/ until the FTP step runs.

Do **not** deploy this product to Azure.

---

## 1. Day-to-day: work on a branch

```bash
git checkout main
git pull origin main
git checkout -b feature/short-description
```

Make your changes, then:

```bash
git add .
git status          # never commit .env, server/.env, passwords, FTP scripts
git commit -m "Describe why this change exists."
git push -u origin HEAD
```

Open a PR into `main` on GitHub. After review/merge:

```bash
git checkout main
git pull origin main
```

**API:** Render rebuilds from `main` automatically (usually a few minutes).  
**Frontend:** still needs the cPanel steps below if UI files changed.

---

## 2. Local setup (once per machine)

```bash
git clone https://github.com/untitledproject223-lang/Property25.git
cd Property25
npm install
cd server && npm install && cd ..
```

Create `server/.env` from `server/.env.example` (ask the team lead for Neon + JWT values).

Frontend against the **live API** when testing production behaviour:

```bash
# project root — .env.production (already used by production builds)
VITE_API_URL=https://property25.onrender.com
```

Dev against local API:

```bash
# optional .env.local
VITE_API_URL=http://localhost:4000

npm run dev:api    # terminal 1 — API
npm run dev        # terminal 2 — UI
```

---

## 3. Push the live Midpoint UI (cPanel)

Do this after UI changes are on `main` (or from the branch you intend to ship — usually `main`).

### 3.1 Build

From the **repo root**:

```bash
git checkout main
git pull origin main

# Confirm production API URL exists:
# .env.production → VITE_API_URL=https://property25.onrender.com

npm run build:website
```

That writes a static site into `website/`:

- `website/index.html`
- `website/assets/*` (js, css, wasm)
- `website/.htaccess`

Vite is configured with `base: '/real/'` so paths match Midpoint.

### 3.2 Upload to cPanel (FTP)

| Setting | Value |
|---------|--------|
| Host | `midpointblue.co.za` |
| Port | `21` (FTP, passive mode) |
| User | `property25deploy@midpointblue.co.za` |
| Password | Ask the team lead (do **not** commit it) |
| Remote folder | FTP account home = `public_html/real` (upload to `/`) |

Upload **everything inside** `website/` (overwrite existing files):

- `index.html`
- `.htaccess`
- `assets/` (all files)

**GUI:** FileZilla / WinSCP — connect with the table above, drag `website/` contents into the remote root.

**CLI (PowerShell + Python):** ask the lead for a one-off upload script, or set env vars and run a local helper that is **not** committed:

```powershell
$env:FTP_HOST = "midpointblue.co.za"
$env:FTP_USER = "property25deploy@midpointblue.co.za"
$env:FTP_PASS = "<ask-lead>"   # never commit this
# then run your local ftp_upload.py that reads those env vars
```

### 3.3 Verify

1. Hard-refresh: https://midpointblue.co.za/real/#/login (`Ctrl+Shift+R`)
2. View page source — `index.html` should reference the **new** hashed files under `/real/assets/…`
3. Log in and smoke-test the screens you changed
4. If login fails but the page loads, check Render: https://property25.onrender.com/api/health

---

## 4. Who does what

| Change type | Git | Render (API) | Midpoint FTP |
|-------------|-----|--------------|--------------|
| Backend only (`server/…`) | PR → `main` | Auto | Not needed |
| Frontend only (`src/…`) | PR → `main` | Usually none | **Required** |
| Both | PR → `main` | Auto | **Required** |

Prefer one person (or a short rotation) to own the Midpoint FTP step so credentials stay controlled.

---

## 5. Checklist before you share with the team

- [ ] PR merged to `main` (or you built from the commit you mean to ship)
- [ ] Render deploy finished green (API changes)
- [ ] `npm run build:website` succeeded with `VITE_API_URL=https://property25.onrender.com`
- [ ] FTP upload of full `website/` completed
- [ ] Hard-refresh on https://midpointblue.co.za/real/#/login works
- [ ] No secrets committed (`.env`, FTP password, Neon URL)

---

## 6. Common mistakes

| Mistake | Result |
|---------|--------|
| Push branch, skip FTP | Midpoint still shows old UI |
| Build without `.env.production` | UI may point at wrong/missing API |
| Upload only `index.html` | Broken site (missing hashed JS/CSS/wasm) |
| Commit FTP password or `.env` | Security incident — rotate secrets |
| Deploy to Azure | Out of scope — Midpoint + Render only |

---

## 7. Quick “ship it” card

```bash
# 1) Merge your PR to main, then:
git checkout main && git pull origin main

# 2) API is already deploying on Render if server/ changed.

# 3) Ship UI to Midpoint:
npm run build:website
# 4) FTP contents of website/ → property25deploy@midpointblue.co.za (remote /)

# 5) Share:
# https://midpointblue.co.za/real/#/login
```
