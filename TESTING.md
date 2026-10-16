# Farmiqo Testing

## What runs here (all passing, Oct 2026)

```bash
npm run check    # node --check ×6 (app, server, api, icons, en, te) + vite build
npm test         # 51 tests: 42 API integration + 3 i18n integrity + 3 frontend-wiring regression + 3 native-config regression (real backend + in-memory replica set)
npm audit --omit=dev   # 0 vulnerabilities
```

`tests/integration.mjs` boots the unmodified `backend/server.js` as a child process against
`mongodb-memory-server` (single-node replica set, so checkout **transactions** run for real)
and asserts over HTTP: liveness/readiness probes, registration validation + duplicate-email
409, login 401/200, session gating, farmer-only listing creation (consumer 403, invalid 400),
public marketplace visibility, cart stock 409 then success, COD checkout (total snapshot,
cart cleared, history), the full farmer chain `ORDER_PLACED → … → COMPLETED` with COD `PAID`,
invalid-transition 409, stock restoration on reject, malformed-id 404, unknown-route 404,
plus bulk groups (create/validation, join limits, duplicate-join 409, aggregation on target,
leave, cancel, fulfil-to-delivery-orders with stock decrement, insufficient-stock 409,
discovery), rule-based forecast (method label, sales math, sparse-data honesty, farmer-only),
password reset (validation, single-use token, weak-password 400, login with new password),
uploads 503-when-unconfigured (farmer) + consumer 403, profile update (validation,
role/email immutability), and account deletion (password gate,
login refused after, listings withdrawn). Bulk extras: community creation by consumer
and farmer, assignment eligibility/duplicate/non-farmer/closed guards, unassign,
mandatory join address validation, saved-address joins with coordinate snapshots (foreign/malformed ids rejected), farmer-only participant address view (public view hides them), per-participant `DELIVERY` fulfil orders,
premature/unauthorized fulfil guards, creator-cancel by a consumer, concurrent joins
capped at target with no duplicates, image URL/source validation, farmer profile edit.
Fee tests: 5% table (100→5 … 2000→100), paise rounding (33.33→1.67), tamper-proofing
(extra `deliveryFee`/`total`/`discount` ignored), `PICKUP` creation rejected, bulk-fulfil fee.
Address tests: CRUD validation, 10-address cap, cross-user isolation (404s), order
snapshot from `addressId` (coords+label), foreign/malformed id rejection, legacy
address path, farmer-visible coords with stranger 403s, no coordinate leaks in listings,
farmer-only farm coordinates, public `/api/config`.
Payment tests: `UPI_MOCK`/unknown methods rejected with `INVALID_PAYMENT_METHOD`, missing method defaults to COD, confirmation payload completeness (order code, items, subtotal, fee, total, address, dates, COD status).
`tests/i18n.mjs` asserts en/te key parity, no duplicate keys, non-empty strings, and
no mixed Indic scripts in Telugu values.

- `vite build`: 1916 modules, ~142 KB JS (~41 KB gzip) + 17 KB CSS — passes.
- Backend boot smoke test (isolated port, throwaway `JWT_SECRET`, no DB): process prints
  `Farmiqo API listening`, `GET /api/health` → **503 disconnected**, `GET /api/listings` →
  **503** via the DB gate. Correct degraded behavior (UI loads, data routes refuse).
- i18n integrity (`tests/i18n.mjs`): identical key sets in each locale, zero duplicate
  literals, non-empty strings, zero non-Telugu Indic codepoints in `te.js`, both modules import cleanly.
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
- [ ] Production cross-account walkthrough on live data (register → list → order → fulfil with
  two real devices; local suite covers the same flow against an isolated database).

## Feature gaps closed in this release (all covered by the 41-test suite)

1. **Bulk groups** — real `BulkGroup` model (farmer offers + community groups with farmer
   assignment) + atomic join/leave/cancel/fulfil; fulfil mints one COD `DELIVERY` order
   per participant. No frontend dummy data remains.
2. **Demand forecast** — rule-based MVP over the farmer's own 30-day sales, explicitly
   labeled `rule-based-30d` (no ML claims); honest insufficient-data state.
3. **Forgot password** — token-hash + 1-hour expiry + single-use flow, Brevo HTTPS API
   delivery (Railway free tier blocks SMTP); returns 503 until the owner configures keys.
4. **Image uploads** — Cloudinary signed-upload flow (free tier, no card); UI degrades to
   `https:` URL paste until the owner configures credentials.

## Remaining external dependencies (owner actions, not code gaps)

- Brevo account + sender verification (`BREVO_API_KEY`, `RESET_FROM_EMAIL`) for reset mail.
- Cloudinary account (`CLOUDINARY_*`) for direct photo uploads.
- Real payment gateway account for non-mock UPI (COD fully works; mock UPI stays labeled).

## Regression policy

Re-run `npm run check` + `npm audit` before every commit/release; re-run the boot smoke test
after touching `backend/server.js`; execute `DEPLOYMENT.md` Step 5 after every backend deploy.
