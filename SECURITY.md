# Farmiqo Security

## Authentication & authorization

- Passwords: bcrypt, cost 12. Registration requires name, valid email, role, password ≥ 8 chars (≤72 bytes); pincodes validated as 6 digits.
- Sessions: JWT (`sub`, `role`, 7-day expiry), `JWT_SECRET` ≥ 32 chars enforced at boot; `npm run setup:local` generates 48 random bytes into untracked `.env` (0600).
- Every protected route re-loads the user from DB (`401 INVALID_SESSION` if gone); role gates (`requireRole`) separate farmer/consumer powers; order detail checks ownership (consumer or assigned farmer); farmers can only touch their own listings/sub-orders.
- Logout is client-side (token drop + socket disconnect). There is **no server-side revocation**: a stolen token is valid until expiry. Acceptable for launch; a denylist/rotation scheme is future work.
- Auth endpoints rate-limited per IP (20 attempts / 15 min, `Retry-After` header).

## Input & injection hardening

- Registration/listing/order/cart payloads validated for type, range, length, and format; unknown update fields stripped via allowlist.
- `escapeRegex` on category filter; `encodeURIComponent` on id paths; `isValidObjectId` guards; `isSafeImageUrl` (empty, `/assets/…`, or credential-free `https:` only, ≤2048 chars).
- Frontend escapes interpolated data (`escapeHtml`) and search input values; image double-prefix repaired centrally.
- No raw queries, no string-built filters, no `eval`; error handler returns generic messages (500 → `INTERNAL_ERROR`, 400 → `INVALID_REQUEST`) and logs only name/code.

## Transport & platform

- Production must be HTTPS end-to-end; native builds **refuse** non-`https:` API origins; CI enforces `FARMIQO_API_ORIGIN=https://…`.
- Helmet with strict CSP (`scriptSrcAttr 'unsafe-inline'` is required by the inline-handler UI — see below), `frameAncestors 'none'`, `Cache-Control: no-store` on API.
- CORS allowlist: local dev origins + `APP_ORIGIN` + host-provided URL + Capacitor schemes. No wildcard.
- Android: only `INTERNET` permission. No private keys in repo (release signing via env/secrets; `keystore.properties` gitignored).

## Known limitations (accepted, documented)

1. CSP allows `scriptSrcAttr 'unsafe-inline'` — unavoidable until the UI migrates to `addEventListener`; mitigated by output escaping.
2. No automated backups on Atlas M0 — add `mongodump` routine and upgrade tier once production data matters.
3. No security-event logging/monitoring yet — add host log drains + error tracking post-deploy.
4. `npm audit` is clean (Oct 2026); re-run before every release. Capacitor 7 → 8 and Vite 6 → 8 are pending major upgrades — schedule with rebuild testing.

## Token storage review: Android & iOS (Capacitor)

Current state: the JWT and user profile live in WebView `localStorage`
(`services/api.js`: `farmiqo-session-token`, `farmiqo-user`). Assessment:

- **Threat model:** on non-compromised devices this is isolated per app and acceptable
  for launch; exposure is bounded by the 7-day JWT expiry and server-side user checks.
  On rooted/jailbroken devices, or via physical backup extraction, WebView storage can
  be read — a stolen token is valid until expiry (no server revocation).
- **Decision: keep `localStorage` for this release.** Migrating to
  `@capacitor/preferences` (still unencrypted) or a Keychain/Keystore-backed secure-storage
  plugin adds native dependencies and untestable-on-this-machine auth changes; the gain
  does not justify the risk right now.
- **Later hardening (approved direction, not yet scheduled):** move the token to
  Keychain (iOS) / EncryptedSharedPreferences-backed storage (Android) via a maintained
  Capacitor secure-storage plugin, shorten JWT lifetime with a refresh-token rotation,
  and add a server-side token denylist for logout/account-deletion.

## New flows in this release

- **Password reset:** reset tokens never stored raw (SHA-256 hash only), 1-hour TTL expiry with
  automatic cleanup, single-use, rate-limited like login, generic responses (no account
  enumeration). Delivery only via Brevo HTTPS API — Railway's free tier blocks outbound SMTP,
  so SMTP was deliberately not used. Test-only token exposure is double-gated
  (`MAILER_PROVIDER=test` **and** `NODE_ENV=test`) and impossible in production.
- **Uploads:** the server never accepts file bytes. It mints time-bound Cloudinary signatures
  scoped to `farmiqo/<farmerId>` folders for farmer sessions only; delivery URLs still pass
  the existing `https:` allowlist when saved on listings. Client validates JPEG/PNG/WebP ≤ 5 MB.
- **Account deletion:** password re-verification required; runs in one transaction (listings
  withdrawn, open bulk participations unwound, carts/notifications/reset rows removed, past
  orders preserved as financial records).
- **Delivery addresses & coordinates:** address CRUD is strictly owner-scoped (foreign ids
  return `404`, never distinguishing missing vs. foreign). Order coordinates are stored
  server-side from owned addresses only and exposed solely to the ordering consumer and the
  assigned farmer (existing order-ownership checks); public listing APIs carry no coordinates,
  and farm coordinates appear only on the farmer's own profile. Join/order coordinates are
  range-validated; map search goes directly from the browser to Nominatim (no key, no proxy).
- **Delivery fee integrity:** computed only in `deliveryFeeFor()` from the authoritative
  subtotal; client-submitted fee/total/discount fields are ignored by construction (the
  route never reads them). `DELIVERY_FEE_PERCENT` is validated once at boot (0–100).

## CRITICAL: Atlas `0.0.0.0/0` migration plan (temporary test entry)

Verified against official Railway docs: **static outbound IPs are a Pro-plan (paid) feature**,
and Railway free-tier outbound SMTP is disabled (hence the HTTPS mail API above). Options:

| Option | Cost | Effect |
|---|---|---|
| A. Keep `0.0.0.0/0` + compensating controls | Free | Works today: least-privilege DB user (readWrite on the Farmiqo DB only, no admin roles), strong unique password, TLS enforced by Atlas, no sensitive data in logs |
| B. Upgrade to Railway Pro + enable static outbound IPs, then narrow the Atlas allowlist to those exact IPs | Paid (needs approval) | Removes open access; redeploy after toggling |

**Do not narrow or remove the entry until option B is active and verified, or the live app
disconnects.** Exact owner action for B: Railway dashboard → service **Settings → Networking → enable Static Outbound IPs** → redeploy → copy the shown IPs → Atlas **Network Access** → replace `0.0.0.0/0` with those IPs → confirm `/api/health` still 200. Recommended posture until then: option A (already the case — the app user must not hold Atlas admin).

## Secret rules (never violated)

`.env` untracked; `.env.example` holds placeholders only; JWT/Mongo URIs only in host secret managers or local `.env`; signing keys only in `%USERPROFILE%\.farmiqo` / GitHub Secrets; never print, commit, or paste credentials.
