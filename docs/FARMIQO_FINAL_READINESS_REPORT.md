# Farmiqo Final Readiness Report — 2026-10-16

## Overall application health
Stable. Full audit (`FARMIQO_MASTER_AUDIT.md`) found zero Critical defects and
one High defect (native permissions), now fixed. All other findings are
accepted/documented with rationale.

## Verified workflows (code + automated tests)
- Consumer: register → browse/search → product detail → cart → map address →
  5% fee checkout → COD order → animated confirmation → history/tracking.
- Farmer: register → profile + farm map pin → listings CRUD + stock → bulk
  offers → community assignment → fulfil → per-participant COD delivery orders
  → order status chain → COD reconciliation → forecast.
- Bulk: community creation, join/leave, limits, aggregation, cancel, fulfil,
  stock restore, concurrency guard, address snapshots with coordinates.
- Account: reset via hashed single-use tokens, profile edit with cancel,
  password-gated deletion with cascade cleanup.

## Build results
- `node --check` (app, server, api, icons, en, te): pass.
- `npm run check` (Vite production build): pass (incl. Leaflet chunk).
- Local debug APK: built with temurin JDK 21 (`assembleDebug`), verified via
  `aapt2`: `com.farmiqo.app` v1.0 (1), all permissions present. Artifact path:
  `android/app/build/outputs/apk/debug/app-debug.apk` (local only, gitignored).

## Backend results
- 42 integration tests against in-memory MongoDB replica set (transactions real).
- Auth, validation, ownership, privacy, fee math, bulk lifecycle all green.

## Database health result
- Production Atlas: `/api/health` → `{"service":"farmiqo-api","database":"connected"}`.
- Local: replica-set transactions verified in tests. No production data touched.

## Security results
- `npm audit`: 0 vulnerabilities. No secrets in tracked files or git history
  (`.env` never committed; placeholders only). Helmet CSP, CORS allowlist,
  auth rate limits, owner-scoped queries, hashed reset tokens, signed upload
  scoping all verified in code.

## Performance findings
- No new dependencies except leaflet (already present). No query changes.
- List endpoints capped at 200, indexed farmer/status/pincode fields.
- Leaflet loads lazily only on map screens (separate Vite chunk).

## Test results
- `npm test`: **51/51 pass** (42 integration + 3 i18n + 3 wiring + 3 native-config).
- No test weakened; 3 new regression tests added this session.

## Android build result
- Verified working: debug APK builds and installs metadata correctly.
- Signed release APK/AAB: requires the release keystore in CI secrets (see install guide).

## iOS build result
- Project verified (bundle id, 1.0, deployment target 14.0, orientations).
- Simulator + signed IPA: macOS CI only; signed IPA additionally requires an
  Apple Developer account, Distribution certificate, and provisioning profile.
- No physical iPhone installation claimed.

## Web build result
- Production `dist/` builds cleanly; single-origin serving via Express;
  no localhost references in production paths; PWA manifest + service worker present.

## Known limitations
- GPS/camera/photo on native builds now permission-declared but not
  device-tested here (no physical device in this environment).
- Atlas `0.0.0.0/0` remains until owner applies the SECURITY.md migration.
- Free-tier hosting means cold starts are possible; no uptime SLA claimed.
- Telugu layout on small screens and screen-reader pass not device-verified.

## Remaining external requirements
1. Atlas network hardening (dashboard, owner approval).
2. `FARMIQO_API_ORIGIN` repo variable already expected by CI (verify value).
3. Android release keystore secrets for signed builds.
4. Apple Developer account + signing assets for device/IPA distribution.
5. Brevo sender + Cloudinary credentials to enable reset mail and photo uploads.
6. Physical-device walkthrough of GPS, camera, Telugu layout, and end-to-end journeys.
