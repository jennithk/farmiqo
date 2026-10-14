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

## Secret rules (never violated)

`.env` untracked; `.env.example` holds placeholders only; JWT/Mongo URIs only in host secret managers or local `.env`; signing keys only in `%USERPROFILE%\.farmiqo` / GitHub Secrets; never print, commit, or paste credentials.
