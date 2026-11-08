# Farmiqo Database

## Provider

**MongoDB Atlas, replica set (transactions required).** Start on the free-forever **M0** tier
(512 MB storage, shared CPU/RAM, ~100 ops/sec, 10 GB in/out per 7 days, **no automated backups**,
one free cluster per project). Verified against official Atlas docs, October 2026.
Farmiqo's catalog/orders fit comfortably in 512 MB for launch; upgrade to paid (M10+)
when data, traffic, or backup needs exceed M0 — that upgrade needs owner approval.

Setup: Atlas → cluster + database user → Network Access allow the backend host (narrowest
rule practical) → set `MONGODB_URI` **only** in the backend host's secret manager.
The API returns HTTP 503 on data routes until Atlas connects (`GET /api/health` shows it).

## Collections (all in `backend/server.js`)

**User** — `name*`, `email*` unique lowercase, `phone`, `passwordHash*` (bcrypt-12),
`role*` (`FARMER|CONSUMER`), `farmName`, `location`, `pincode`, `farmLat/farmLng`
(farmer-only, set via profile map), `farmAddress`, `rating`, `completedOrders`,
`verified`, timestamps. Indexes: `email` (unique). Farm coordinates are returned
only on the owner's own profile (`safeUser`); public listing views expose no coordinates.

**Listing** — `farmerId*` ref User (indexed), `productName*`, `category` (indexed, default `Veg`),
`description`, `price*` (≥0), `priceUnit` (default `kg`), `quantity*` (≥0),
`minOrderQuantity` (default 1), `maxOrderQuantity` (nullable), `harvestedAt*`,
`availableFrom/Until`, `location`, `pincode` (indexed), `farmingMethod`, `chemicalUsage`,
`grade`, `imageUrl` (local `/assets/` path or `https:` only — enforced server-side),
`imageSource` (`''|photo|url|ai|asset` — labels farmer photos vs illustrations),
`deliveryAvailable/pickupAvailable`, `status` (`ACTIVE|PAUSED|DELETED`, indexed), timestamps.
Soft delete: `DELETE /api/listings/:id` sets `DELETED`; public queries only return `ACTIVE` + `quantity > 0`.

**Cart** — one per consumer (`consumerId` unique + indexed), `items[]` (`listingId`, `quantity`).
Cart writes re-validate live stock and per-listing min/max on every add/update.

**Order** — `orderId` unique (`FQ-<8 hex>`, indexed; creation retries on collision),
`consumerId` (indexed), denormalized `consumerName/Phone`, `items[]` with snapshotted
`priceAtPurchase` + `subtotal`, `subOrders[]` per farmer (`subOrderId`, `farmerId`,
`itemIndexes[]`, `status`), `subtotal/deliveryFee/discount/communitySavings/total`,
`paymentMethod` (`COD` for all new orders; legacy `UPI_MOCK` rows kept readable), `paymentStatus` (`PENDING|PARTIALLY_PAID|PAID`),
COD collection metadata, `status`, `fulfillment` (`DELIVERY|PICKUP`), `address/pincode`,
`addressLabel`, `deliveryLat/deliveryLng` (snapshot from the chosen saved address;
`null` for legacy manual addresses), `expectedAt`, timestamps.
`deliveryFee` is always server-computed: `round2(subtotal × DELIVERY_FEE_PERCENT / 100)`;
`total = round2(subtotal + fee)`. New orders are `DELIVERY`-only (stored `PICKUP` rows
from before remain readable with their state machine intact). COD `PAID`
reconciliation counts the fee in both collected and due amounts. Status state machine (farmer-only transitions):
`ORDER_PLACED → FARMER_ACCEPTED|FARMER_REJECTED|CANCELLED → PREPARING → READY_FOR_PICKUP|OUT_FOR_DELIVERY → DELIVERED → COMPLETED`.
Reject/cancel restores stock atomically; COD totals reconcile to collected sub-orders.

**Notification** — `userId` (indexed), `kind`, `message`, `data`, `readAt`, timestamps.

**Address** — consumer delivery addresses: `userId` (indexed), `label`
(`Home|College|Other`), `house/street/area/landmark`, `pincode` (6-digit), `phone`,
`lat` (−90…90), `lng` (−180…180), `formattedAddress`, timestamps. Max 10 per user;
all reads/writes owner-scoped (a foreign id returns `404`, never hints at existence).
Delivery coordinates on orders are visible only to the ordering consumer and the
assigned farmer — never in public listing APIs.

**BulkGroup** — Community demand pooling & farmer bulk offers: `groupId` (unique), `productName`, `targetQuantity`, `minPerParticipant`, `maxPerParticipant`, `collectedQuantity`, `participantCount`, `participants` (`userId`, `quantity`, `joinedAt`, `address`, `pincode`, `deliveryLat`, `deliveryLng`, `addressLabel`, `addressId`), `model` (`offer|community`), `farmerId` (ref User), `assignedFarmerId` (ref User), `listingId` (ref Listing), `pincode`, `status` (`OPEN|TARGET_REACHED|ASSIGNED|COMPLETED|CANCELLED`), `slotDate`, `pickupNote`, `deliveryInfo`, `assignmentHistory`, timestamps.
- Fulfil runs in a MongoDB transaction: conditional stock decrement plus one COD `DELIVERY` `Order` per participant using join-time snapshot addresses, advancing to `COMPLETED`.

**PasswordReset** — Single-use password recovery tokens: `userId` (indexed ref User), `tokenHash` (SHA-256 hash, unique index), `expiresAt` (indexed with TTL expiration), timestamps. Email delivered via Brevo HTTPS API.

## Planned / Future Models (Not Yet Implemented)

- **Review / Rating** — Post-delivery farmer and produce ratings: `orderId`, `consumerId`, `farmerId`, `listingId`, `rating` (1–5), `comment`, timestamps.
- **PaymentTransaction** — Audit log for live payment gateways (Razorpay/UPI).

## Migrations & backups

- No migration runner exists; schema changes today mean code-level Mongoose changes
  (additive fields with defaults are safe; destructive changes need owner approval).
- M0 has **no Atlas backups**: keep a periodic `mongodump` to owner-controlled storage
  once production data matters, and upgrade tier for point-in-time recovery.
- Pagination: list endpoints cap at 200 rows, newest-first — sufficient for launch;
  add cursor pagination when any list approaches that cap in practice.
