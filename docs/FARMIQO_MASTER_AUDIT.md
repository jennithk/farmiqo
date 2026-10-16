# Farmiqo Master Audit — 2026-10-16

Scope: full repository at commit `2c13e0c` (branch `main`), plus uncommitted
CRLF-only working-tree noise (no content changes). Backend `backend/server.js`
(1517 lines), frontend `app.js` (618 lines), `services/api.js`, `services/icons.js`,
`i18n/en.js` + `i18n/te.js`, `tests/` (48 tests), configs, Android/iOS projects,
workflows, deployment files. Production API was live and healthy
(`{"service":"farmiqo-api","database":"connected"}`).

Severity scale: Critical (data loss / breach / app unusable), High (feature
broken or security weakness with realistic exploit), Medium (UX defect, hardening
gap, maintainability), Low (cosmetic, dead code, docs).

## A. Verified working — no defect (with evidence)

- A1. Auth flows: register/login/logout/session restore; bcrypt + JWT; rate
  limit 20/15min on auth routes (`backend/server.js:229,423,448,1349,1377`).
  Covered by integration tests (48/48 passing).
- A2. Role separation: every privileged route carries `requireRole`; order
  detail enforces consumer-or-assigned-farmer ownership (`:847-854`); address
  CRUD is owner-scoped (`:692-730`); bulk cancel restricted to creator/assignee
  (`:1132-1151`); farmer bulk view scoped to own/assigned groups (`:1037-1045`).
- A3. Checkout: transactional, conditional atomic stock decrement, server-side
  5% fee (`deliveryFeeFor`), addressId ownership check, COD-only enforcement,
  double-submit guard + timeout recovery in `payNow`.
- A4. Bulk: atomic join guard (no dupes/overshoot), transactional leave/fulfil,
  eligibility-checked assignment with history, per-participant COD DELIVERY
  orders with snapshot coords.
- A5. Privacy: public bulk views omit addresses/coords (`bulkGroupView`);
  full details only in farmer endpoint; listings expose no farm coordinates
  (`farmerSummary`); farmLat/Lng only in own `safeUser`.
- A6. Password reset: SHA-256 hashed tokens, 1h TTL index, single-use, generic
  responses, Brevo HTTPS API (SMTP blocked on free tier), double-gated test hook.
- A7. i18n parity enforced by `tests/i18n.mjs`; wiring enforced by
  `tests/frontend-wiring.mjs` (the exact class that caused the production
  `getAddresses is not defined` incident).
- A8. No secrets in tracked files or git history (`.env` never committed;
  only `<placeholder>` URIs in `.env.example`/docs).
- A9. `npm audit`: 0 vulnerabilities. Vite production build succeeds.
- A10. CI workflows validate HTTPS `FARMIQO_API_ORIGIN` and fail without it.

## B. Findings

### F1 — Native GPS/camera permissions missing (High)
- Module: Mobile / Files: `android/app/src/main/AndroidManifest.xml:40`,
  `ios/App/App/Info.plist` (missing keys).
- Defect: manifest declared INTERNET only; no location/camera/photo-library
  permissions or iOS usage descriptions, so native GPS pin and camera capture
  fail on installed apps (web fallback exists, native does not prompt).
- Cause: permissions never added when map/photo features shipped.
- Impact: "Use my location" and "Take photo" broken on Android/iOS builds.
- Reproduce: install APK → open map picker → tap GPS → silent failure.
- Correction: add permissions + usage descriptions. No code dependency on it.

### F2 — Dead shadowed screen implementations (Low)
- Module: Frontend / File: `app.js:142-179` (old `farmerHome`, `listings`,
  `bulkOrders`, `forecast`, `consumerHome`, `productCard`, `bulkGroups`,
  `cart`, `orders`, `profile`, `payment`, `payNow` with fake BHEL data and UPI).
- Defect: ~40 lines of dead code carrying fake demo data and UPI references.
- Cause: earlier rewrites used reassignment (`bulkOrders=...`) instead of replacement.
- Impact: none at runtime (all shadowed; verified live bindings win); confusion risk only.
- Correction: intentionally NOT removed — reassignment chains (`const
  originalPaymentScreen = payment`, `bulkOrders=farmerOrdersView`) depend on the
  declarations existing. Documented here instead.

### F3 — Legacy UPI display fallbacks in live order cards (Low, accepted)
- Module: Frontend / `app.js` order badges (`'UPI · Mock'` fallback branches).
- These render only for historical `UPI_MOCK` rows; new orders are COD-only
  (backend rejects, test-covered). Kept deliberately for readability of old records.

### F4 — Reset-token double-use race (Low)
- Module: Backend / `POST /api/auth/reset` (`server.js:1384-1388`): find-then-mark
  is not atomic; two simultaneous uses of one token could both pass within milliseconds.
- Impact: negligible (requires the secret token twice in the same ms); token is
  single-use in all normal flows.
- Correction: accepted risk, documented; fixing would require changing a working
  flow for no practical gain.

### F5 — Atlas `0.0.0.0/0` network entry (Medium, owner action)
- Already tracked in `SECURITY.md` migration plan; static egress IPs are a paid
  Railway feature. Not changeable from here. Compensating posture documented.

### F6 — iOS `armv7` device capability (Low)
- `ios/App/App/Info.plist` lists only `armv7`; harmless on modern devices
  (Apple still honors it) but obsolete. Left untouched to avoid signing churn.

## C. Coverage verification (tests → requirements)
48 tests: 42 integration (auth, marketplace, cart, orders, transitions, bulk
lifecycle incl. concurrency, forecast honesty, reset incl. test mailer, profile
validation, uploads honesty, account deletion, fee table/rounding/tamper,
address isolation/snapshot/privacy, farm coords, public config, bulk address
snapshots, COD-only) + 3 i18n + 3 wiring. All passing at audit time.

## D. Not defects (explicitly checked, working as designed)
- `pickupAvailable` listing flag: inert metadata, never surfaced in UI.
- `PUT /api/users/me` farm-field gating for FARMER role only.
- `GET /api/config` + `/api/ready` public by design (no sensitive data).
- `expectedAt` passthrough validated by Mongoose cast → 400 on garbage.
- Deleted-user population edge (`listing.farmerId.name` if farmer deleted):
  mitigated — account deletion withdraws listings first.
