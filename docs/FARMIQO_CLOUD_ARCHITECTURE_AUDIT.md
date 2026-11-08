# Farmiqo Cloud Architecture Audit (Read-Only)

Date: 2026-10-17 · Checkpoint: `fe07f33` (`main`) · Scope: repository code,
configuration and deployment files, plus read-only live probes of the public
production origin. No files were modified and no cloud settings were changed.
Only this document was created.

Read-only live probes used (GET only): `GET /`, `GET /api/health`,
`GET /api/ready`, `GET /api/config`, `GET /manifest.webmanifest` on
`https://farmiqo-production.up.railway.app`. No accounts, orders, uploads or
production records were created.

---

## A. Overall conclusion

**CLOUD-BASED VERIFIED.**

Permanent Farmiqo business data is stored in a cloud MongoDB (Atlas replica set)
and production services run on a cloud host (Railway). The web client is served
from the same cloud origin, and Android/iOS builds are required to embed a public
HTTPS API origin at build time. No production code path depends on `localhost`,
a laptop IP, a local Node process, or local-only storage. Device storage is used
only for the auth token, a cached user profile, and UI preferences — never as the
source of truth for orders, listings, inventory, addresses, carts or groups.

---

## B. Architecture table

| Component | Provider | Storage location | Purpose | Evidence |
|---|---|---|---|---|
| Backend API (Express 5) | Railway | Cloud container | Business logic, REST + Socket.IO | `railway.json:4-13` (Dockerfile builder, `startCommand: npm run api`, `healthcheckPath: /api/ready`, 1 replica); `Dockerfile` `CMD ["npm","run","api"]` |
| Web frontend | Railway (same origin) | Cloud container static `dist/` | Browser UI | `Dockerfile` runs `npm run build`; `backend/server.js:17,248` serves `../dist`; live `GET /` returns built index referencing `assets/index-rzJgrDHX.js` |
| Database | MongoDB Atlas | Cloud (Atlas replica set) | All persistent records | `MONGODB_URI` `mongodb+srv://…` (`.env.example:7`); `backend/server.js:1482` `mongoose.connect(mongoUri…)`; live `GET /api/health` → `{"database":"connected"}` |
| Realtime channel | same Railway container | Cloud | Live order/listing/bulk events | `backend/server.js` Socket.IO; `services/api.js:123-139` `io(base…)` where `base` is the API origin |
| Image/file storage | Cloudinary (optional) | Cloud object storage | Product photos | `services/api.js:120-121`; `backend/server.js:1393-1406` signed upload; `app.js:491` uploads to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload`, stores `secure_url` |
| Password-reset email | Brevo HTTPS API (optional) | Cloud | Reset links | `backend/server.js:271-286` `https://api.brevo.com/v3/smtp/email` (chosen because Railway free tier blocks SMTP) |
| Mobile shells | Capacitor (Android/iOS) | Local app bundle + cloud API | Native app UI | `capacitor.config.json`; `services/api.js:4-8` forces an HTTPS API root in native builds |

---

## C. Permanent data audit

All records below are persisted through Mongoose models (`backend/server.js:35-197`):
`User`, `Listing`, `Cart`, `Order`, `Notification`, `Address`, `BulkGroup`.
The app enforces this by refusing all data routes with HTTP 503 until Atlas is
connected (`backend/server.js:419-421`).

| Data | Actual storage | Evidence |
|---|---|---|
| User accounts + auth | Cloud (Atlas `User`, bcrypt hashes) | `server.js:440`, `452`; live `/api/health` connected |
| Farmer profiles + farm details | Cloud (`User` farm fields) | `server.js:505` update; coords farmer-only tests `tests/integration.mjs:717` |
| Products + inventory | Cloud (`Listing.quantity`) | `server.js:573` create, `604/615` update/delete; tests 136,156 |
| Cart + checkout records | Cloud (`Cart` per consumer; `Order` on checkout) | `server.js:624,639`; checkout clears server cart test 177 |
| Orders + status | Cloud (`Order` with `subOrders`) | `server.js:795`; farmer advance test 194 |
| Delivery addresses + coordinates | Cloud (`Address` owner-scoped; snapshot into `Order`) | `server.js:694`; tests 667, 703 |
| Bulk groups + participants | Cloud (`BulkGroup` with participants) | `server.js:145` schema, join/leave/fulfil tests 254,286,304 |
| Payment/COD records | Cloud (`Order.paymentMethod`/`paymentStatus`, COD-only) | COD-only test 585; `payNow` sends `paymentMethod:'COD'` |
| Reviews / other | N/A — no review feature exists in this repo | No Review model in `server.js:35-197` |

**Cloud DB confirmation.** Production uses MongoDB Atlas; the only accepted URI
shape is `mongodb+srv://` (Atlas). A local MongoDB is used **only** in development
(`.env.example:7`; `scripts/dev.js` runs the API locally with the developer's
`.env`). 

**No silent local fallback.** If `MONGODB_URI` is absent, the server logs a warning
and every `/api` data route returns `503 DATABASE_UNAVAILABLE`; it never falls back
to an embedded/on-disk database (`server.js:1478`, `419-421`). No SQLite/lowdb/
embedded DB exists in the repo.

**Failure handling.** `mongoose.connect` uses `serverSelectionTimeoutMS: 10000`;
`error` and `disconnected` events are handled (`server.js:1482,1493,1496`).
`/api/health` reports `503 disconnected` until Atlas is reachable; `/api/ready`
stays 2xx for the host liveness check.

**Durability + isolation.** Data lives in Atlas, so it survives app restarts,
device changes, backend restarts and redeploys. Per-user isolation is enforced by
owner-scoped queries and is covered by tests: address-book ownership isolation
(`tests/integration.mjs:634`), strangers rejected on orders (`:667`), delivery
coordinates private (`:703`), farm coordinates farmer-only (`:717`).

---

## D. Device storage audit

All device persistence uses `localStorage`. No `sessionStorage`, `IndexedDB`,
SQLite, `Capacitor Preferences`, or Filesystem API usage was found anywhere in the
project (searched `app.js`, `backend/server.js`, `services/api.js`, `i18n/*.js`,
`scripts/*.js`).

| Key | Class | Written by | Assessment |
|---|---|---|---|
| `farmiqo-session-token` | 2. Auth/session | `services/api.js:55,65` | Necessary. Only a JWT; server validates on every request. Not business data. |
| `farmiqo-user` | 2/3. Session cache | `api.js:56,66`; `app.js:389,595` | Cached profile for instant UI. Server is source of truth: `restoreSession` re-fetches `/auth/me` (`app.js:588-600`). Not authoritative. |
| `farmiqo-language` | 4. UI preference | `app.js:202` | Necessary UI choice. Not business data. |
| `farmiqo-last-address` | 4. UI preference | `app.js:312` | Stores the selected address **id**; the address records themselves come from the server (`refreshAddresses`, `api.js:98`). Convenience only. |
| `farmiqo-joined` | 5. Legacy/offline leftover | `app.js:108` (`persist`) | Written only by `joinGroup` (`app.js:174`), a **shadowed dead function** replacing nothing live. Live bulk joins use `joinBulkGroupUI` (`app.js:481`) → server. No live read of this key. Harmless but dead. |

**Cart and orders are not device-authoritative.** `state.cart` and `state.orders`
are in-memory mirrors refreshed from the server (`refreshMarketplace` calls
`getCart`, `app.js:129`; `refreshOrders` calls `getOrders`, `app.js:131`). No local
key is the source of truth for orders, listings, inventory, addresses, carts or
groups.

**Service worker.** `public/sw.js` caches only the app shell and same-origin images;
it explicitly skips `/api`, `/socket.io/`, cross-origin requests, and any request
carrying an `authorization` header (`sw.js:36-40`). It never caches business data,
so offline/stale caching cannot become a data source of truth.

---

## E. Production independence

**Farmiqo can run with your laptop switched off.** Evidence:

1. The backend is a cloud container defined by `railway.json` + `Dockerfile`,
   started with `npm run api`, restarting `ON_FAILURE` on Railway — not on your PC.
2. The database is Atlas, reached over the internet via `MONGODB_URI`; no local
   DB process is required in production.
3. Production web is served by that same container: live `GET /` returns the
   Vite-built `index-rzJgrDHX.js`, and `GET /api/config` returns
   `{"deliveryFeePercent":5}` — so the browser talks to the cloud origin, not to
   your machine.
4. Mobile builds cannot silently use your laptop: `services/api.js:6-8` requires a
   configured `https://` root for native, otherwise it fails with an explicit
   `API_URL_NOT_CONFIGURED` error rather than contacting localhost. CI enforces a
   valid HTTPS `FARMIQO_API_ORIGIN` (`.github/workflows/mobile-build.yml:28-36`).
5. `localhost`/`127.0.0.1` appear only in the dev CORS allowlist
   (`server.js:19-22`) and the dev-only `scripts/dev.js`; they are not used by any
   production request path.
6. Deploys are performed by GitHub Actions (`deploy-backend.yml`) using a Railway
   token — no dependency on a running personal machine.

---

## F. Problems found

Only genuine issues are listed. None is a local-storage or laptop-dependency
defect.

1. **Low — leftover `RENDER_EXTERNAL_URL` in the CORS allowlist.**
   Root cause: the project previously targeted Render, which was removed by owner
   policy (`README.md:70`). `backend/server.js:24` still spreads
   `process.env.RENDER_EXTERNAL_URL` into allowed origins. Impact: none in practice
   (the variable is unset on Railway, so it contributes nothing), but it is dead
   config that could surprise a future reader.

2. **Low — `isSafeImageUrl` accepts any HTTPS URL, not just Cloudinary.**
   `backend/server.js:254-265` accepts any `https://` URL for `listing.imageUrl`
   (no username/password). Root cause: a general-purpose URL validator. Impact: a
   farmer could reference an arbitrary external HTTPS image rather than only a
   Cloudinary asset. Not a local-storage problem and not cross-device breaking;
   hardening only.

3. **Low/Info — dead `farmiqo-joined` local key and `joinGroup`/`persist`.**
   `app.js:108,174` write a local key from a shadowed legacy function that live
   flows never call. Impact: none at runtime; minor confusion only.

4. **Info — transient first health 503.** The first `GET /api/health` probe
   returned `503 disconnected`; an immediate retry returned
   `{"database":"connected"}` twice. Consistent with a cold start / initial Atlas
   connection, not a misconfiguration. No user-facing defect observed.

5. **Medium (external, owner action, not architecture) — free-tier availability.**
   `DEPLOYMENT.md:15` documents Railway free credit ("runs until free credit
   exhausts") and `README.md:75` documents Atlas M0 free tier. These can cause
   unavailability or future cost if quotas are exceeded; this affects uptime/SLA,
   not the cloud architecture itself.

No Critical or High problems were found.

---

## G. Recommended next steps

**Necessary fixes:** none. The architecture is already correct for cloud operation
without your laptop.

**Optional improvements (do not implement without approval):**
- Remove the dead `RENDER_EXTERNAL_URL` spread (`server.js:24`) to eliminate a
  stale Render reference.
- F1 (from the earlier audit): commit the native GPS/camera/photo permissions
  already added locally so installed apps can use those features (unrelated to
  cloud storage, but pending).
- Restrict `isSafeImageUrl` to known Cloudinary hosts if third-party image URLs
  are not desired.
- Delete the dead `farmiqo-joined`/`joinGroup`/`persist` code path in the next
  cleanup pass.
- Track Atlas/Railway free-tier limits and set a billing/alert threshold so the
  cloud service is not silently suspended.

---

## H. Verification limitations

Could not be verified from the repository + public probes alone:

- **Dashboard state:** Railway service variables/secrets, Atlas cluster region and
  network access list, and whether `RAILWAY_TOKEN`, `BREVO_*`, and `CLOUDINARY_*`
  are actually set in the cloud. Presence was inferred from config code and live
  endpoint behavior, not from reading secrets (none were accessed or displayed).
- **Free-tier specifics:** exact Railway credit balance, Atlas M0 storage limits,
  Cloudinary/Brevo quotas — only what the repository documents was used; no
  provider console was opened.
- **Physical-device testing:** cross-device login was verified by code tracing and
  server-isolation tests, not by installing the app on two real phones. Native GPS,
  camera capture, Telugu layout, and push/Socket.IO behavior were not exercised on
  hardware.
- **`.env` contents:** deliberately never read or printed, per the audit rules.
- **Historical/live data:** no real accounts, orders or production records were
  created or inspected.

---

## Final answers

1. **Is Farmiqo already cloud-based?** Yes — **CLOUD-BASED VERIFIED**.
2. **Can it operate with your laptop off?** Yes. Backend, database and web client
   all run in the cloud (`railway.json`, `Dockerfile`, `MONGODB_URI` Atlas; live
   `GET /` + `/api/health` + `/api/config` all served from the Railway origin).
3. **Is any permanent business data stored locally?** No. Users, profiles,
   listings/inventory, carts, orders, addresses/coords, bulk groups and COD records
   are all in Atlas. Device storage holds only the session token, a cached profile,
   and UI preferences (`app.js`, `services/api.js`).
4. **Are uploaded images/files cloud-hosted?** Yes — Cloudinary, via signed direct
   uploads; the permanent `secure_url` is saved in the listing record
   (`app.js:491`, `server.js:1393-1406`). When Cloudinary is unset, uploads are
   honestly disabled with `503 UPLOAD_NOT_CONFIGURED` (no local-disk fallback).
5. **Can users access their data across devices?** Yes. Logging in on another
   device issues a fresh token and `restoreSession` reloads profile, marketplace,
   cart, orders and addresses from the server (`app.js:588-600`), with Socket.IO
   live updates. Isolation tests confirm users only see their own data.
6. **What actual problems remain?** Only low/info items: a dead
   `RENDER_EXTERNAL_URL` CORS reference, a permissive-but-HTTPS image URL
   validator, a dead `farmiqo-joined` key, and documented free-tier limits. No
   Critical/High and no laptop dependency.
7. **Does anything need to change?** The cloud architecture is already correct and
   needs no change to run without your computer. The listed items are optional
   cleanups, plus the pending native-permissions commit from the prior audit.
