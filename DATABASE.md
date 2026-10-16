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
`role*` (`FARMER|CONSUMER`), `farmName`, `location`, `pincode`, `rating`, `completedOrders`,
`verified`, timestamps. Indexes: `email` (unique).

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
`paymentMethod` (`COD|UPI_MOCK`), `paymentStatus` (`PENDING|PARTIALLY_PAID|PAID`),
COD collection metadata, `status`, `fulfillment` (`DELIVERY|PICKUP`), `address/pincode`,
`expectedAt`, timestamps. Status state machine (farmer-only transitions):
`ORDER_PLACED → FARMER_ACCEPTED|FARMER_REJECTED|CANCELLED → PREPARING → READY_FOR_PICKUP|OUT_FOR_DELIVERY → DELIVERED → COMPLETED`.
Reject/cancel restores stock atomically; COD totals reconcile to collected sub-orders.

**Notification** — `userId` (indexed), `kind`, `message`, `data`, `readAt`, timestamps.

## Planned (not yet implemented — do not invent tables in code until approved)

Bulk groups need: `BulkGroup` (name, product, targetQty, minQty, slotDate, pincode,
`status: OPEN|AGGREGATED|CLOSED|FULFILLED`, createdBy) + `BulkMembership`
(groupId, consumerId, quantity, status, timestamps) with a unique (groupId, consumerId)
index (`groupId` unique, `farmerId`/`assignedFarmerId`/`listingId`/`pincode`/`status`/`model`).
Two models: `offer` (farmer-bound listing, owner auto-assigned) and `community` (any
authenticated user names a product; no listing required). `assignedFarmerId` +
`assignmentHistory[]` record who supplies the group; `deliveryInfo` plus per-participant
`address`/`pincode` (required at join) capture the delivery arrangement. Lifecycle:
`OPEN → TARGET_REACHED → ASSIGNED → COMPLETED` plus `CANCELLED`
(legacy `AGGREGATED`/`FULFILLED` rows still read correctly).
Fulfil runs in one transaction: conditional stock decrement (offer listing, else the
assigned farmer's best-stocked matching listing) plus one COD `DELIVERY` `Order` per
participant using the join-time address (missing address aborts with `ADDRESS_REQUIRED`),
then `COMPLETED`. Demand forecast is computed on read from `Order`/`Listing` (no new
collection). Password recovery uses `PasswordReset` (`userId` indexed, `tokenHash`
unique, TTL expiry on `expiresAt`) holding only SHA-256 hashes — delivery via Brevo
HTTPS API (see `DEPLOYMENT.md` for keys).

## Migrations & backups

- No migration runner exists; schema changes today mean code-level Mongoose changes
  (additive fields with defaults are safe; destructive changes need owner approval).
- M0 has **no Atlas backups**: keep a periodic `mongodump` to owner-controlled storage
  once production data matters, and upgrade tier for point-in-time recovery.
- Pagination: list endpoints cap at 200 rows, newest-first — sufficient for launch;
  add cursor pagination when any list approaches that cap in practice.
