# Farmiqo Architecture

## Current architecture (as built)

```
Android (Capacitor) ─┐
iPhone (Capacitor) ──┤
Installed PWA ───────┼──▶ https://<api-origin>/api (Express, single origin also serves dist/)
Desktop browser ─────┘         │
                               ▼
                    MongoDB Atlas replica set (Mongoose; transactions for checkout)
```

- **Frontend:** vanilla-JS single-page app (`app.js` + `services/api.js` + `services/icons.js`), built by Vite into `dist/`. No frontend framework. State is a single in-memory `state` object; server data is re-fetched per screen; JWT + user profile persist in `localStorage`.
- **Backend:** single-file Express 5 API (`backend/server.js`, ~730 lines) + Socket.IO account rooms (`user:<id>`). Mongoose models: `User`, `Listing`, `Cart`, `Order` (with per-farmer `subOrders`), `Notification`.
- **Realtime:** listing broadcasts are global; order/notification events target account rooms. Auth via JWT in the Socket.IO handshake.
- **Native shells:** Capacitor 7, app id `com.farmiqo.app`, `webDir: dist`. Native builds bundle the web app (no dev-server dependency) and **require** `VITE_API_URL=https://<api>/api` at build time — plain HTTP/localhost origins are rejected by `services/api.js`.
- **Environments:** dev (`npm run dev`: API :3000 + Vite :5173 with proxy), production (single origin: `npm run api` serves API + static `dist/`).
- **Cloud host:** Railway (Dockerfile + `railway.json`, `GET /api/ready` liveness probe, restart `ALWAYS`) + Atlas M0 — see `DEPLOYMENT.md`. No Render (`render.yaml` removed); no serverless hosts (this is a long-lived Express + Socket.IO process).

## Cross-platform decision: Capacitor retained, no Expo rewrite

Evaluated per the "retain a suitable cross-platform framework" rule:

| Option | Verdict |
|---|---|
| Keep Capacitor 7 + PWA | **Selected.** Already configured (Android `com.farmiqo.app`, iOS `com.farmiqo.app`, CI builds APK/AAB + iOS simulator/IPA, PWA install on iPhone via Safari). One codebase serves web, Android, and iOS. |
| Rewrite to React Native / Expo + TypeScript | **Rejected.** Would discard the working backend integration and UI, add a second stack to maintain, and cannot be validated here (no emulators, no Expo/EAS account, no devices). Violates "do not unnecessarily rebuild". Capacitor is **not** a raw WebView hack: it provides native project shells, native APIs, signed-store distribution (AAB/IPA), and the same backend/business logic both shells share. |

Revisit only if a future requirement needs native modules Capacitor cannot provide.

## Backend structure (`backend/server.js` sections)

1. Boot/config validation (`JWT_SECRET` ≥ 32 chars, `DELIVERY_FEE` numeric, port check).
2. Schemas/models (see `DATABASE.md`).
3. Security middleware: helmet CSP, CORS allowlist, 1 MB JSON cap, `no-store`, auth rate limit (20 attempts / 15 min / IP).
4. Routes: auth → listings → farmer inventory → cart → orders (transactional) → farmer order status (state machine) → notifications → SPA fallback → error handler.
5. Socket.IO auth + rooms; graceful shutdown (SIGINT/SIGTERM, mongoose disconnect).

## Key design rules

- Backend validates and prices everything; the client never sets totals, stock, or statuses directly.
- Checkout and status transitions run in MongoDB transactions with conditional atomic updates (no oversell; stock restored on reject/cancel).
- Bulk groups are real, in two models: farmer `offer`s (listing-bound, owner auto-assigned) and `community` groups (any authenticated user names a product; a farmer self-assigns after an eligibility check against live stock, with history). Atomic join/leave, target aggregation, creator-or-assignee cancel, and fulfil that mints one COD `DELIVERY` order per participant (join-time addresses, always required) inside one transaction. Demand forecast is a rule-based MVP (`rule-based-30d`, no ML claims) with an honest insufficient-data state. Password reset (Brevo HTTPS API, 503 until configured), Cloudinary signed uploads (503 until configured), and password-gated account deletion are implemented. Product imagery prefers farmer photos, labels photo vs illustrative sources, and uses a strict keyword→photo map with a neutral tile fallback. Category icons are centralized (`CATEGORY_ICONS`/`produceIcon`); people icons never represent produce. Do not fake any of these with client-side data.
- Cash on Delivery is the only payment method; new `UPI_MOCK` orders are rejected (`400 INVALID_PAYMENT_METHOD`). Legacy `UPI_MOCK` rows remain readable via unchanged display branches. COD completes when the farmer records delivery; no gateway exists.
- Secrets live in the host secret manager / local `.env` only. `VITE_*` vars must never carry secrets (they ship in the client bundle).
