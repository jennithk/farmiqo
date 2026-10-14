# Farmiqo Release Checklist

## Status legend: [x] done · [ ] blocked (owner or external step required)

### Cloud & data
- [x] Backend cloud-ready (env-driven, single-origin, liveness `/api/ready` + readiness `/api/health`, no prod localhost).
- [x] Database design + free-tier selection (Atlas M0) documented (`DATABASE.md`).
- [x] Host selected + verified (Railway: Express/WS/Atlas/persistence per official docs); `Dockerfile`, `.dockerignore`, `railway.json`, `deploy-backend.yml` committed; integration suite (11 tests) green.
- [ ] **[OWNER]** Create Atlas M0 + user + network rule (`DEPLOYMENT.md` Step 1).
- [ ] **[OWNER]** Connect GitHub repo on Railway, generate domain (`DEPLOYMENT.md` Step 2).
- [ ] **[OWNER]** Set Railway variables `MONGODB_URI`, `JWT_SECRET`, `APP_ORIGIN`, `DELIVERY_FEE`, `NODE_ENV` (Step 3); verify `/api/ready` + `/api/health` from mobile data.
- [ ] **[OWNER]** Add `RAILWAY_TOKEN` secret (+ optional `RAILWAY_SERVICE_NAME` var) for CI deploys; set `FARMIQO_API_ORIGIN` var; run Mobile Builds (Step 4).
- [ ] `DEPLOYMENT.md` Step 5 laptop-off test passed — only then claim production.

### Mobile builds
- [x] Android/iOS identity + permissions + CI workflows configured.
- [ ] **[OWNER]** Set `FARMIQO_API_ORIGIN`; run `Mobile Builds`; install APK on a real device against production.
- [ ] **[OWNER]** Android signing key created + backed up (`scripts/setup-android-signing.ps1`); signed AAB from CI.
- [ ] **[OWNER]** Apple Developer enrollment + signing secrets; signed IPA via CI; TestFlight/App Store submission.

### Product & legal (placeholders — need real business details + legal review)
- [ ] Support contact, business name/address, data-retention + account-deletion workflow
  (account deletion: in-app request → owner verifies → delete User + anonymize order records; not yet built).
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
6. Decisions (need approval): always-on hosting budget (~$5–7/mo) if free sleep is unacceptable;
   email/SMS provider for password recovery; object storage for image uploads; bulk-group build-out.
