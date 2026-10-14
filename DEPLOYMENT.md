# Farmiqo Deployment (Railway backend + Atlas database)

> Owner policy: **no Render** (`render.yaml` removed), **no paid services or subscriptions
> without approval**, no secrets in git. Nothing here provisions anything — every step needing
> your account or secret is marked **[OWNER ACTION]**. No service is "deployed" until its
> public endpoint returns a tested response (Step 5).

## Why Railway (verified against official docs, Oct 2026)

| Requirement | Railway status |
|---|---|
| Express 5 long-running Node | Yes — Dockerfile/Nixpacks services stay up; `railway.json` sets restart `ON_FAILURE` (up to 10 retries) |
| Socket.IO / WebSockets | Yes — official Socket.IO guide; WS exempt from proxy timeouts, stays open while idle; client already reconnects |
| Outbound MongoDB Atlas | Yes — no egress whitelist; standard `mongodb+srv://` connection |
| Persistent execution | Yes — no sleep policy; runs until free credit exhausts |
| Free without a card | **Free plan: $0/mo + $1 usage credit/mo, card-free start**; plus a one-time $5 trial grant. Honest limit: ~$1 covers roughly 1–2 weeks of 24/7 micro-service run; when credit hits zero, workloads stop until credit resets or you approve spend |

Rejected: Render (owner ban), Koyeb/Northflank (card + verification hold required),
Fly.io (paid), Vercel/Netlify/Cloudflare (serverless functions — cannot run this server),
SnapDeploy (100 container-hrs/mo + 15-min sleep; keep as emergency fallback only).

## Repo configuration (already done — do not re-do)

- `Dockerfile` — Node 22 slim, `npm ci`, `npm run build`, `CMD ["npm","run","api"]`. No secrets baked in.
- `.dockerignore` — keeps `android/`, `ios/`, `.env`, git, docs out of the image.
- `railway.json` — Dockerfile builder, `startCommand: npm run api`, `healthcheckPath: /api/ready`, restart `ON_FAILURE` (up to 10 retries), 1 replica.
- `GET /api/ready` — host liveness probe (always 200 when the process is up, even pre-database).
- `GET /api/health` — readiness (200 only when Atlas connects; 503 otherwise).
- Backend already honors injected `PORT`, binds `0.0.0.0`, sets `trust proxy` under `NODE_ENV=production`, and serves API + `dist/` from one origin.
- `.github/workflows/deploy-backend.yml` — runs `npm run check` + `npm test` on every relevant push; deploys via Railway CLI only when `RAILWAY_TOKEN` exists, otherwise reports "skipped" and stays green.

## Step 1 — Database [OWNER ACTION, ~15 min, free]

1. Page: **mongodb.com/atlas** → sign up/in → create project → **Create cluster → M0 Free** (any nearby region) → create database user (generate a password, least privilege on the Farmiqo DB).
2. Page: **Network Access → Add IP** → allow the Railway service (narrowest rule practical; Atlas shows current guidance per host).
3. Copy the connection string (`mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority`) — you will paste it into Railway in Step 3, nowhere else.

## Step 2 — Backend service [OWNER ACTION, ~10 min, free]

1. Page: **railway.com** → sign up (GitHub SSO is fine, no card for the Free plan) → **New Project → Deploy from GitHub repo** → select `jennithk/farmiqo`.
2. Railway auto-detects the `Dockerfile` (also pinned by `railway.json`). If it asks for a builder, choose **Dockerfile**.
3. Page: service **Settings → Networking → Generate Domain** → copy the public origin, e.g. `https://farmiqo-api.up.railway.app`. (Exact suffix varies — use whatever Railway assigns.)
4. Page: service **Settings → Health Check**: confirm path **`/api/ready`**, timeout **300s** (already in `railway.json`; dashboard shows the same values).

## Step 3 — Environment variables [OWNER ACTION, Railway dashboard only]

Page: service **Variables** → add exactly these (paste values into Railway, never into code or chat):

| Variable | Value to enter |
|---|---|
| `MONGODB_URI` | Atlas URI from Step 1 |
| `JWT_SECRET` | Generate: any ≥32-char random string (e.g. `openssl rand -base64 48`). Railway has no generator for this — paste your own |
| `APP_ORIGIN` | Your Railway domain from Step 2 (e.g. `https://farmiqo-api.up.railway.app`) |
| `DELIVERY_FEE` | `0` |
| `NODE_ENV` | `production` |

`PORT` is injected by Railway automatically — do not set it. Redeploy after saving; then open
`https://<your-domain>/api/ready` (expect `{"ok":true,…"ready":true}`) and
`https://<your-domain>/api/health` (expect 200 `connected` once Atlas accepts the URI).

## Step 4 — CI deploy + mobile origin [OWNER ACTION]

1. Page: Railway **account settings → Tokens** → create a project token with deploy scope → GitHub repo **Settings → Secrets and variables → Actions → Secrets → New repository secret** named **`RAILWAY_TOKEN`**, value = the token. The token **must be a secret, never a repository variable** — variables are visible in logs and forks, secrets are masked.
2. Page: GitHub repo **Settings → Secrets and variables → Actions → Variables → New repository variable** for each of the following (only needed when your Railway names differ from the defaults; the workflow targets them explicitly so non-interactive deploys never guess):
   - **`RAILWAY_SERVICE_NAME`** — defaults to `farmiqo-api`. Must match the actual service name in your Railway project.
   - **`RAILWAY_ENVIRONMENT_NAME`** — defaults to `production`. Must match the actual environment name in your Railway project.
3. From now on, pushes to `main` touching app code run the full gate automatically: `npm run check` (syntax + production build) and `npm test` (11 integration tests) **always run first**; the Railway deploy step runs only if they pass. If `RAILWAY_TOKEN` is missing, deployment is **skipped automatically** (the workflow stays green and prints the skip notice) — tests still run and must still pass.
4. Page: GitHub repo **Settings → Secrets and variables → Actions → Variables → New repository variable** named **`FARMIQO_API_ORIGIN`**, value = your Railway domain (`https://…`). This bakes the production API origin into Capacitor builds (must be `https:`, never localhost — CI rejects anything else). Then run the **Mobile Builds** workflow (or tag `v*`) for the store-bound APK/AAB + iOS artifacts.

## Step 5 — Laptop-independence acceptance test (all must pass)

1. From a phone on mobile data (laptop off, local backend stopped): open `https://<domain>/api/health` → 200.
2. Install the CI-built APK / open the installed PWA; register a farmer and a consumer on different networks.
3. Farmer creates a listing → consumer sees it; consumer orders (COD) → farmer inbox shows it; farmer advances status → consumer tracking updates; restart the app → session and data persist.
4. Any failure blocks the production claim — fix before release.

## Updates, rollback, costs

- Backend: push to `main` (tests gate the deploy); Railway keeps the last image per its retention for rollback; keep API changes additive for shipped apps.
- Watch Railway **Usage** page: Free $1/mo credit sustains roughly 1–2 weeks of continuous run; the $5 trial grant covers the first stretch. If the service stops, check credit first. Anything beyond free needs your explicit approval.
