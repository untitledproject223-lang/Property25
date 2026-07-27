# Property25
Multi-tenant real estate application platform ,post-viewing tenant screening, affordability checks, document vault, and light CRM. Built with JS, Neon (Postgres), and MongoDB.
# Real Estate System
Multi-tenant platform for rental agencies — automate post-viewing tenant applications, affordability checks, credit/ID screening, document collection, and a light CRM pipeline.
**One codebase. Many agencies.** New customers get configuration (branding, rules, roles) — not a rebuild.
---
## Problem
Tenant screening today is mostly manual: agents review bank statements and payslips for red flags, chase incomplete applications over WhatsApp, and glue together expensive tools for payments, e-sign, and storage.
Agencies need an affordable, integrated workflow from **viewing → application → decision → tenant**.
---
## Phase 1 scope
### Included
- Post-viewing applicant invite link
- Online forms (personal details, income, expenses)
- Secure document upload (ID, payslips, bank statements)
- Affordability scoring (e.g. rent ≤ ~1/3 of gross income)
- Screening integration (RentCheck, ID verification, bank statements)
- Incomplete-application email reminders
- E-sign for the full application packet
- Light CRM pipeline: lead → applicant → tenant
- Agency billing via Paystack (subscription + screening credits)
### Not in Phase 1
- Chatbots
- Tenant rent / debit-order collection
- Full Payprop replacement
- Maintenance ticketing / inspections
- Cross-agency buyer matching
---
## Stack
| Layer | Technology | Role |
|-------|------------|------|
| App | JavaScript (Vercel) | Agent + applicant portals, API, webhooks |
| Primary DB | Neon (Postgres) | Source of truth — orgs, users, apps, status, billing, audit |
| Secondary DB | MongoDB Atlas | Files (PDFs/images), form drafts, screening JSON, webhooks |
| Screening | Provider API | RentCheck, ID verify, bank statements |
| Billing | Paystack | Agency seats + screening credits *(not tenant rent)* |
| Email | Resend / Postmark | Invites + reminders |
> **No separate cloud file storage.** Images and PDFs live in MongoDB (`document_files`). Neon stores metadata and pointers only.
---
## Architecture (short)
```
Agent / Applicant
        │
        ▼
  JS App + API (Vercel)
        │
   ┌────┴────┐
   ▼         ▼
 Neon      MongoDB
 (truth)   (files + JSON)
   │         │
   └────┬────┘
        ▼
 Screening API · Paystack · Email
```
**Rule of thumb**
- **Neon** → anything you list, filter, join, or permission
- **MongoDB** → anything bulky, nested, binary, or schema-flexible
Every row/document is scoped by `org_id` (multi-tenant).
---
## Documentation
| Doc | Description |
|-----|-------------|
| [docs/MILESTONES.md](docs/MILESTONES.md) | Design → production milestones (M0–M5) |
| [docs/PHASE1-DATA-ARCHITECTURE.md](docs/PHASE1-DATA-ARCHITECTURE.md) | How Neon + MongoDB operate together |
| [docs/MEETING-SCRIPT.md](docs/MEETING-SCRIPT.md) | Team alignment meeting script |
| [docs/Phase1-Architecture-Reference.pdf](docs/Phase1-Architecture-Reference.pdf) | Short printable architecture reference |
PDF generators live under `scripts/`.
---
## Roadmap (high level)
| Phase | Focus |
|-------|--------|
| **1** | Application engine + affordability + screening + light pipeline |
| **2** | Rent reminders, debit orders, payment gateway |
| **3+** | Deeper CRM, maintenance tickets, inspections, WhatsApp |
---
## Team
Built by a team of 3. Suggested split:
| Role | Focus |
|------|--------|
| Backend / product | Tenancy, APIs, affordability, Neon schema |
| Frontend | Agent + applicant portals, pipeline UI |
| Integrations / QA | Screening, Paystack, email, Mongo files, demos |
---
## Getting started
> Application code is not scaffolded yet. This repo currently holds product docs and architecture.
When the app lands:
```bash
# clone
git clone <repo-url>
cd real-estate-system
# install (example)
npm install
# configure env
cp .env.example .env
# set DATABASE_URL, MONGODB_URI, SCREENING_*, PAYSTACK_*, RESEND_*, MAX_UPLOAD_BYTES
# run
npm run dev
```
### Expected environment variables
```env
DATABASE_URL=
MONGODB_URI=
SCREENING_API_KEY=
SCREENING_API_BASE_URL=
PAYSTACK_SECRET_KEY=
RESEND_API_KEY=
MAX_UPLOAD_BYTES=10485760
```
---
## License
Private — all rights reserved.
