# Farmiqo Testing

## What runs here (all passing, Oct 2026)

```bash
npm run check    # node --check ×6 (app, server, api, icons, en, te) + vite build
npm test         # 11 integration tests: real backend + in-memory replica set
npm audit --omit=dev   # 0 vulnerabilities
```

`tests/integration.mjs` boots the unmodified `backend/server.js` as a child process against
`mongodb-memory-server` (single-node replica set, so checkout **transactions** run for real)
and asserts over HTTP: liveness/readiness probes, registration validation + duplicate-email
409, login 401/200, session gating, farmer-only listing creation (consumer 403, invalid 400),
public marketplace visibility, cart stock 409 then success, COD checkout (total snapshot,
cart cleared, history), the full farmer chain `ORDER_PLACED → … → COMPLETED` with COD `PAID`,
invalid-transition 409, stock restoration on reject, malformed-id 404, unknown-route 404.
CI (`.github/workflows/deploy-backend.yml`) runs `npm run check` + `npm test` before any deploy.

- `vite build`: 1916 modules, ~142 KB JS (~41 KB gzip) + 17 KB CSS — passes.
- Backend boot smoke test (isolated port, throwaway `JWT_SECRET`, no DB): process prints
  `Farmiqo API listening`, `GET /api/health` → **503 disconnected**, `GET /api/listings` →
  **503** via the DB gate. Correct degraded behavior (UI loads, data routes refuse).
- i18n integrity: 242 keys in each locale, zero duplicate literals, identical key sets,
  zero non-Telugu Indic codepoints in `te.js`, both modules import cleanly.
- Production-localhost audit (`localhost|127.*|192.168.*|10.*`): every hit is dev-only
  (Vite proxy, CORS dev origins, README dev steps) or a scheme identifier
  (`capacitor://localhost`); native production path enforces `https:`.

## What was verified by code tracing (no DB available here)

Auth (register/login/me, role mismatch handling, 401 session clearing), farmer listing
CRUD + validation parity, cart stock re-validation, transactional checkout (atomic decrement,
price snapshot, sub-orders, collision retry, cart clear, notifications), farmer status
state machine + stock restore + COD reconciliation, consumer/farmer order views, realtime
re-subscription, EN/TE runtime substitution, placeholder screens for bulk/forecast.

## NOT tested — requires owner-provided environment (do not claim otherwise)

- [ ] Live Atlas-backed flows (register → list → cart → order → status → delivered).
- [ ] Cross-device sync (two accounts, two networks) and the laptop-off acceptance test (`DEPLOYMENT.md` Step 5).
- [ ] Real APK install + API communication; iOS Simulator artifact; signed AAB/IPA.
- [ ] Telugu rendering/overflow across small/medium/large screens; accessibility pass.
- [ ] Cold-start behavior and sleep policy of the chosen free host.
- [ ] Bulk groups, forecasting, password recovery — **not implemented** (see gaps below).

## Feature gaps vs. the full mobile brief (deferred, not faked)

1. **Bulk groups** (create/join/pooled checkout) — design in `DATABASE.md`; shipping untested
   order-money logic without a live DB was judged riskier than honest placeholders.
2. **Demand forecast** — no forecasting service; placeholder stays until a real data source exists.
3. **Forgot password** — needs an owner-approved delivery channel (email/SMS provider).
4. **Image uploads** — listings accept `https:` URLs or bundled assets; no cloud object storage
   is configured (all free object stores need accounts/keys).

## Regression policy

Re-run `npm run check` + `npm audit` before every commit/release; re-run the boot smoke test
after touching `backend/server.js`; execute `DEPLOYMENT.md` Step 5 after every backend deploy.
