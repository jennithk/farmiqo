# Farmiqo Release Checklist

## Status legend: [x] done · [ ] blocked (owner or external step required)

### Cloud & data
- [x] Backend cloud-ready (env-driven, single-origin, liveness `/api/ready` + readiness `/api/health`, no prod localhost).
- [x] Database design + free-tier selection (Atlas M0) documented (`DATABASE.md`).
- [x] Host selected + verified (Railway: Express/WS/Atlas/persistence per official docs); `Dockerfile`, `.dockerignore`, `railway.json`, `deploy-backend.yml` committed; integration suite (33 tests) green.
- [x] Backend live at `https://farmiqo-production.up.railway.app` (Atlas connected; `/api/ready` + `/api/health` verified from outside the laptop network).
- [ ] **[OWNER — URGENT]** Production database currently UNREACHABLE: `/api/ready` returns 200 (API process alive) but `/api/health` and `/api/listings` return 503 (Atlas disconnected — likely the expired temporary `0.0.0.0/0` test entry). Restore Atlas Network Access per `SECURITY.md`, then re-verify `/api/health` → 200 before any release.
- [x] Bulk groups (farmer offers + community groups with farmer assignment, both delivery modes), rule-based forecast, password reset (gated), signed uploads (gated), password-gated account deletion, and profile editing implemented + tested (33/33).
- [ ] **[OWNER]** Narrow the temporary Atlas `0.0.0.0/0` entry per the migration plan in `SECURITY.md` (needs Pro static IPs or accepted compensating controls).
- [ ] **[OWNER]** Add `RAILWAY_TOKEN` secret (+ optional `RAILWAY_SERVICE_NAME` / `RAILWAY_ENVIRONMENT_NAME` vars) for CI deploys; set `FARMIQO_API_ORIGIN=https://farmiqo-production.up.railway.app`; run Mobile Builds.
- [ ] `DEPLOYMENT.md` Step 5 laptop-off test passed on real devices — only then claim production.

### Mobile builds
- [x] Android/iOS identity + permissions + CI workflows configured.
- [ ] **[OWNER]** Set `FARMIQO_API_ORIGIN=https://farmiqo-production.up.railway.app`; run `Mobile Builds`; install APK on a real device against production.
- [ ] **[OWNER]** Android signing key created + backed up (`scripts/setup-android-signing.ps1`); signed AAB from CI.
- [ ] **[OWNER]** Apple Developer enrollment + signing secrets; signed IPA via CI; TestFlight/App Store submission.

### Product & legal (placeholders — need real business details + legal review)
- [x] Account deletion implemented (profile → password confirm → listings withdrawn, carts/notifications removed, past orders kept as records).
- [ ] Support contact, business name/address, data-retention statement.
- [ ] Screenshots (small/medium/large phones, EN + TE), feature descriptions, permissions rationale (INTERNET only).

**Privacy policy draft (adapt + review before publishing):** Farmiqo collects your name, email,
phone, role, farm/location/pincode, listings, cart, orders, and delivery details to operate the
farmer-to-consumer marketplace. Data is stored in our cloud database and transmitted over HTTPS.
We do not sell personal data. [ADD: retention periods, deletion contact, analytics/crash-reporting
disclosure if added, children's policy, jurisdiction.] UPI payments are simulated in-app; no
payment credentials are collected by Farmiqo.

**Terms draft (adapt + review):** Farmiqo is a marketplace venue connecting farmers and consumers;
product quality, availability, and delivery are the farmer's responsibility. Prices snapshot at
order time. COD orders complete on farmer-recorded delivery. Prohibited: unlawful goods,
misrepresentation, account sharing, abuse of other users. [ADD: refunds/disputes process,
liability limits, governing law, termination terms.]

**Data-safety disclosures:** collects personal info (account, purchases, location/pincode);
data encrypted in transit (HTTPS); no data sold; [ADD: actual analytics/crash SDK list or "none"].

### Store metadata
- Name: Farmiqo · Category: Shopping/Food · Short desc: "Farmer-to-consumer marketplace — fresh produce from nearby farms." · Full desc: [owner to write from the workflows above] · Content rating: Everyone · No ads (confirm if this changes).

## Remaining owner-only actions (nothing else can proceed without these)

1. Cloud account connections + secrets (Atlas, backend host).
2. `FARMIQO_API_ORIGIN` + CI build verification on real devices.
3. Android keystore + Apple signing/Developer account.
4. Official logo asset under `public/` + icon regeneration.
5. Business/legal details for privacy, terms, store listings, account deletion.
6. Decisions (need approval): always-on hosting budget (~$5–7/mo) if free credit is insufficient;
   Brevo sender verification for reset mail; Cloudinary credentials for uploads; real UPI gateway
   account; Apple Developer enrollment (paid) for App Store distribution.
