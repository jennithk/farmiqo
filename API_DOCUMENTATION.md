# Farmiqo API Documentation

Base URL: same origin in production (`/api`); dev via Vite proxy. Auth: `Authorization: Bearer <JWT>`
(7-day expiry). Envelope: `{ "ok": true|false, "data": <payload|{code,message}> }`.
Without a database, all `/api/*` except static handling return `503 DATABASE_UNAVAILABLE`;
`GET /api/health` reports `200 connected` / `503 disconnected`.

## Auth

- `POST /api/auth/register` (rate-limited) — `{name, email, phone?, password≥8, role: FARMER|CONSUMER, farmName?, location?, pincode(6-digit)?}` → `201 {user, token}`. `409 EMAIL_IN_USE`.
- `POST /api/auth/login` (rate-limited) — `{email, password}` → `200 {user, token}`. `401 INVALID_CREDENTIALS`.
- `GET /api/auth/me` — current user (validates session; client calls on launch).

## Listings (public read)

- `GET /api/listings?category=&q=&pincode=&farmerId=&minPrice=&maxPrice=` — only `ACTIVE`, `quantity>0`, newest-first, max 200. `q` matches product/farmer/farm/category server-side post-filter.
- `GET /api/listings/:id` — `404 LISTING_UNAVAILABLE` (also for malformed ids).
- `GET /api/farmer/listings` (farmer) — own non-deleted listings.

## Farmer inventory (farmer only)

- `POST /api/listings` — `{productName≤120, category, description≤2000, price≥0, quantity≥0, minOrderQuantity>0, maxOrderQuantity≥min?, harvestedAt*, pincode?, imageUrl (local /assets/ or https:)*, …}` → `201` + `listing:created` broadcast.
- `PUT /api/listings/:id` — same field rules for supplied fields; `status` may only be `ACTIVE|PAUSED` (delete via `DELETE`). → `200` + `listing:updated|listing:stockUpdated`.
- `DELETE /api/listings/:id` — soft delete (`DELETED`). → `200 {deleted:true}`.

## Cart (consumer only)

- `GET /api/cart` — active listings only, with populated `listing` views.
- `POST /api/cart/items` — `{listingId, quantity}`; validates live stock + min/max. `409 INSUFFICIENT_STOCK`.
- `PUT /api/cart/items/:id` — set quantity (same validation). `404 CART_ITEM_NOT_FOUND`.
- `DELETE /api/cart/items/:id` — remove.

## Orders

- `POST /api/orders` (consumer) — `{paymentMethod: COD (default; UPI_MOCK and anything else rejected with 400), addressId? | address*+pincode*, items? (default: cart)}`. All orders are `DELIVERY` (`fulfillment: PICKUP` is rejected with `400 INVALID_FULFILLMENT`; previously stored `PICKUP` rows remain readable and keep their state machine). A saved `addressId` snapshots that address (text, pincode, label, coordinates) into the order; otherwise a manual address+pincode is validated. Transactional: conditional stock decrement per line, price snapshot, per-farmer sub-orders, server-computed 5% delivery fee (rounded to paise), order-id collision retry, cart cleared, farmer notifications, `listing:stockUpdated` + `order:created` events. `400 EMPTY_CART|INVALID_*`, `404 ADDRESS_NOT_FOUND`, `409 INSUFFICIENT_STOCK`. Client-submitted totals/fees are ignored.
- `GET /api/orders` (consumer) — own history, newest-first.
- `GET /api/orders/:id` — owner consumer or assigned farmer only (`403` otherwise).
- `GET /api/farmer/orders` (farmer) — orders containing own sub-order, with `{order, subOrder}` pairs.
- `GET /api/farmer/bulk/groups` (farmer) — own-created and assigned bulk groups with full participant delivery details (address, pincode, coordinates). Public group views expose names/quantities only.
- `PATCH /api/orders/:id/status` (farmer) — guarded transitions (see `DATABASE.md`); reject/cancel restores stock; COD payment reconciled; emits `order:*` + `notification:new`.

## Addresses (consumer only, owner-scoped)

- `GET /api/addresses` — own saved addresses, newest-first.
- `POST /api/addresses` — `{label: Home|College|Other, house?, street?, area?, landmark?, pincode (6-digit), phone?, lat (-90…90), lng (-180…180), formattedAddress?}`. Max 10 per user.
- `PUT /api/addresses/:id`, `DELETE /api/addresses/:id` — own addresses only (`404` otherwise).

## Notifications & health

- `GET /api/notifications` — own, newest-first, max 100.
- `GET /api/health` — `{service, database}`; doubles as the host readiness probe.
- `GET /api/config` — public runtime config: `{deliveryFeePercent}`. Works without a database.

## Realtime events (Socket.IO, JWT handshake, `user:<id>` rooms)

`listing:created|updated|stockUpdated`, `order:created|accepted|rejected|cancelled|preparing|ready|dispatched|delivered|completed`, `notification:new`, `cart:updated`, `bulk:updated`.

## Advanced Implemented Endpoints

- **Bulk groups:**
  - `POST /api/bulk/groups` — Create offer (farmer, listing-bound) or community group (any authenticated user).
  - `GET /api/bulk/groups` — List groups (`?status,model,pincode,farmerId,assignedFarmerId`).
  - `GET /api/bulk/groups/:id` — Group details.
  - `POST /api/bulk/groups/:id/join` — Join group with quantity and snapshotted delivery address.
  - `POST /api/bulk/groups/:id/leave` — Leave group.
  - `POST /api/bulk/groups/:id/assign` — Farmer self-assign with live matching inventory eligibility check.
  - `POST /api/bulk/groups/:id/unassign` — Release farmer assignment.
  - `POST /api/bulk/groups/:id/cancel` — Creator or assignee cancels group.
  - `POST /api/bulk/groups/:id/fulfil` — Assignee fulfils group: transactionally decrements stock and mints one COD `DELIVERY` order per participant.
- **Demand forecast:** `GET /api/farmer/forecast` — Rule-based 30-day forecast by pincode, with insufficient data flag when history is sparse.
- **Password recovery:**
  - `POST /api/auth/forgot` — Request password reset email (Brevo HTTPS integration; 503 until Brevo credentials configured).
  - `POST /api/auth/reset` — Confirm reset with single-use 1-hour token.
- **Photo uploads:**
  - `GET /api/uploads/config` — Public upload settings (503 until Cloudinary configured).
  - `POST /api/uploads/signature` — Farmer Cloudinary signed params.
- **Account management:**
  - `PUT /api/users/me` — Update profile (name, phone, farmName, location, pincode).
  - `DELETE /api/users/me` — Password-gated account deletion (withdraws active listings, preserves past orders for accounting).

## Future Planned Features (Not Yet Implemented)

- **Payment Gateway:** Real online payments (Razorpay / UPI Intent / PhonePe SDK) to supplement Cash on Delivery.
- **Push Notifications:** Native push delivery via Firebase Cloud Messaging (FCM) / Apple APNs.
- **Reviews & Ratings:** Consumer star ratings and reviews on completed farmer orders.
