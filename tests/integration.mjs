// Farmiqo API integration tests.
// Runs the real backend (child process) against an in-memory MongoDB replica set
// (transactions required for checkout), then exercises auth, listings, cart,
// orders, and farmer status transitions over HTTP. No mocks, no stubs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let replset;
let server;
let BASE;

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

async function api(method, path, { token, body, rawBody } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

before(async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['backend/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      MONGODB_URI: replset.getUri('farmiqo-test'),
      JWT_SECRET: randomBytes(48).toString('base64url'),
      API_PORT: String(port),
      NODE_ENV: 'test',
      MAILER_PROVIDER: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for liveness (process up) then readiness (DB connected).
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/api/ready`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  for (let i = 0; i < 100; i++) {
    const r = await fetch(`${BASE}/api/health`);
    const body = await r.json();
    if (r.ok && body.data?.database === 'connected') return;
    await sleep(300);
  }
  throw new Error('backend did not become ready');
}, { timeout: 300000 });

after(async () => {
  server?.kill('SIGTERM');
  await replset?.stop();
});

const farmer = {};
const consumer = {};
let listingId;
let communityMangoId;
let communityTomatoId;

test('liveness and readiness probes', async () => {
  const ready = await api('GET', '/api/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.data?.data?.ready, true);
  const health = await api('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data?.data?.database, 'connected');
});

test('registration validation and duplicate email', async () => {
  const bad = await api('POST', '/api/auth/register', { body: { name: '', email: 'x', password: 'short', role: 'FARMER' } });
  assert.equal(bad.status, 400);
  const reg = await api('POST', '/api/auth/register', {
    body: { name: 'Test Farmer', email: 'farmer@test.farm', password: 'password123', role: 'FARMER', pincode: '520008' },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data?.data?.user?.role, 'FARMER');
  Object.assign(farmer, reg.data.data);
  const dup = await api('POST', '/api/auth/register', {
    body: { name: 'Dup', email: 'farmer@test.farm', password: 'password123', role: 'FARMER' },
  });
  assert.equal(dup.status, 409);
  const cons = await api('POST', '/api/auth/register', {
    body: { name: 'Test Consumer', email: 'consumer@test.farm', password: 'password123', role: 'CONSUMER', pincode: '520008' },
  });
  assert.equal(cons.status, 201);
  Object.assign(consumer, cons.data.data);
});

test('login rejects wrong password, accepts correct', async () => {
  const wrong = await api('POST', '/api/auth/login', { body: { email: 'consumer@test.farm', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  const ok = await api('POST', '/api/auth/login', { body: { email: 'consumer@test.farm', password: 'password123' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data?.data?.token);
});

test('protected routes require a session', async () => {
  const anon = await api('GET', '/api/auth/me');
  assert.equal(anon.status, 401);
  const me = await api('GET', '/api/auth/me', { token: consumer.token });
  assert.equal(me.status, 200);
  assert.equal(me.data?.data?.email, 'consumer@test.farm');
});

test('farmer creates listing; consumer is forbidden', async () => {
  const forbidden = await api('POST', '/api/listings', {
    token: consumer.token,
    body: { productName: 'Nope', price: 1, quantity: 1, harvestedAt: new Date().toISOString() },
  });
  assert.equal(forbidden.status, 403);
  const badListing = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: '', price: -5, quantity: 1, harvestedAt: 'not-a-date' },
  });
  assert.equal(badListing.status, 400);
  const created = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: 'Tomato', category: 'Veg', price: 32, quantity: 20, harvestedAt: new Date().toISOString(), pincode: '520008' },
  });
  assert.equal(created.status, 201);
  listingId = created.data?.data?.id;
  assert.ok(listingId);
});

test('public marketplace shows the listing', async () => {
  const all = await api('GET', '/api/listings');
  assert.equal(all.status, 200);
  assert.ok(all.data?.data?.some((l) => l.id === listingId && l.productName === 'Tomato'));
  const one = await api('GET', `/api/listings/${listingId}`);
  assert.equal(one.status, 200);
  const missing = await api('GET', '/api/listings/not-a-valid-id');
  assert.equal(missing.status, 404);
});

test('cart validates stock then accepts', async () => {
  const tooMuch = await api('POST', '/api/cart/items', { token: consumer.token, body: { listingId, quantity: 9999 } });
  assert.equal(tooMuch.status, 409);
  const added = await api('POST', '/api/cart/items', { token: consumer.token, body: { listingId, quantity: 2 } });
  assert.equal(added.status, 200);
  const cart = await api('GET', '/api/cart', { token: consumer.token });
  assert.equal(cart.status, 200);
  assert.equal(cart.data?.data?.length, 1);
  assert.equal(cart.data?.data?.[0]?.quantity, 2);
});

test('checkout snapshots price and clears cart', async () => {
  const order = await api('POST', '/api/orders', {
    token: consumer.token,
    body: { paymentMethod: 'COD', fulfillment: 'DELIVERY', address: '12 Test Street', pincode: '520008' },
  });
  assert.equal(order.status, 201);
  assert.equal(order.data?.data?.total, 64);
  assert.equal(order.data?.data?.status, 'ORDER_PLACED');
  consumer.orderId = order.data.data.orderId;
  const cart = await api('GET', '/api/cart', { token: consumer.token });
  assert.equal(cart.data?.data?.length, 0);
  const history = await api('GET', '/api/orders', { token: consumer.token });
  assert.ok(history.data?.data?.some((o) => o.orderId === consumer.orderId));
});

test('farmer sees order and advances full status chain', async () => {
  const inbox = await api('GET', '/api/farmer/orders', { token: farmer.token });
  assert.equal(inbox.status, 200);
  assert.ok(inbox.data?.data?.some((e) => e.order?.orderId === consumer.orderId));
  for (const status of ['FARMER_ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']) {
    const updated = await api('PATCH', `/api/orders/${consumer.orderId}/status`, { token: farmer.token, body: { status } });
    assert.equal(updated.status, 200);
  }
  const detail = await api('GET', `/api/orders/${consumer.orderId}`, { token: consumer.token });
  assert.equal(detail.data?.data?.status, 'COMPLETED');
  assert.equal(detail.data?.data?.paymentStatus, 'PAID');
});

test('invalid transition rejected; stock restored on reject', async () => {
  await api('POST', '/api/cart/items', { token: consumer.token, body: { listingId, quantity: 3 } });
  const order = await api('POST', '/api/orders', {
    token: consumer.token,
    body: { paymentMethod: 'UPI_MOCK', fulfillment: 'DELIVERY', address: '12 Test Street', pincode: '520008' },
  });
  assert.equal(order.status, 201);
  const orderId = order.data.data.orderId;
  const skip = await api('PATCH', `/api/orders/${orderId}/status`, { token: farmer.token, body: { status: 'DELIVERED' } });
  assert.equal(skip.status, 409);
  const before = (await api('GET', `/api/listings/${listingId}`)).data?.data?.quantity;
  const rejected = await api('PATCH', `/api/orders/${orderId}/status`, { token: farmer.token, body: { status: 'FARMER_REJECTED' } });
  assert.equal(rejected.status, 200);
  const after = (await api('GET', `/api/listings/${listingId}`)).data?.data?.quantity;
  assert.equal(after, before + 3);
});

test('unknown API route is 404', async () => {
  const res = await api('GET', '/api/does-not-exist');
  assert.equal(res.status, 404);
});

const consumer2 = {};
let bulkListingId;
let groupId;

test('bulk group creation validates role and input', async () => {
  const made = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: 'Bulk Tomato', category: 'Veg', price: 40, quantity: 100, harvestedAt: new Date().toISOString(), pincode: '520008' },
  });
  assert.equal(made.status, 201);
  bulkListingId = made.data?.data?.id;
  const forbidden = await api('POST', '/api/bulk/groups', { token: consumer.token, body: { listingId: bulkListingId, targetQuantity: 10 } });
  assert.equal(forbidden.status, 403);
  const bad = await api('POST', '/api/bulk/groups', { token: farmer.token, body: { listingId: bulkListingId, targetQuantity: -5 } });
  assert.equal(bad.status, 400);
  const created = await api('POST', '/api/bulk/groups', {
    token: farmer.token,
    body: { listingId: bulkListingId, targetQuantity: 10, minPerParticipant: 1, maxPerParticipant: 5, pickupNote: 'Community hall, 7-9 AM', pincode: '520008' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data?.data?.status, 'OPEN');
  assert.ok(/^BG-/.test(created.data?.data?.groupId));
  groupId = created.data?.data?.groupId;
});

test('bulk join enforces limits, duplicates, and aggregation', async () => {
  const reg = await api('POST', '/api/auth/register', {
    body: { name: 'Second Consumer', email: 'consumer2@test.farm', password: 'password123', role: 'CONSUMER', pincode: '520008' },
  });
  assert.equal(reg.status, 201);
  Object.assign(consumer2, reg.data.data);
  const joined = await api('POST', `/api/bulk/groups/${groupId}/join`, { token: consumer.token, body: { quantity: 4, address: '12 Test Street', pincode: '520008' } });
  assert.equal(joined.status, 200);
  assert.equal(joined.data?.data?.collectedQuantity, 4);
  assert.equal(joined.data?.data?.status, 'OPEN');
  const dup = await api('POST', `/api/bulk/groups/${groupId}/join`, { token: consumer.token, body: { quantity: 1, address: '12 Test Street', pincode: '520008' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.data?.data?.code, 'ALREADY_JOINED');
  const overMax = await api('POST', `/api/bulk/groups/${groupId}/join`, { token: consumer2.token, body: { quantity: 6, address: '12 Test Street', pincode: '520008' } });
  assert.equal(overMax.status, 400);
  assert.equal(overMax.data?.data?.code, 'INVALID_SHARE');
  const topUp = await api('POST', `/api/bulk/groups/${groupId}/join`, { token: consumer2.token, body: { quantity: 5, address: '12 Test Street', pincode: '520008' } });
  assert.equal(topUp.status, 200);
  assert.equal(topUp.data?.data?.collectedQuantity, 9);
  assert.equal(topUp.data?.data?.status, 'OPEN');
  const third = await api('POST', '/api/auth/register', {
    body: { name: 'Third Consumer', email: 'consumer3@test.farm', password: 'password123', role: 'CONSUMER', pincode: '520008' },
  });
  assert.equal(third.status, 201);
  const finisher = await api('POST', `/api/bulk/groups/${groupId}/join`, { token: third.data.data.token, body: { quantity: 1, address: '12 Test Street', pincode: '520008' } });
  assert.equal(finisher.status, 200);
  assert.equal(finisher.data?.data?.status, 'ASSIGNED');
  const late = await api('POST', `/api/bulk/groups/${groupId}/join`, { token: third.data.data.token, body: { quantity: 1, address: '12 Test Street', pincode: '520008' } });
  assert.equal(late.status, 409);
  assert.equal(late.data?.data?.code, 'GROUP_CLOSED');
});

test('bulk leave and cancel work on open groups', async () => {
  const created = await api('POST', '/api/bulk/groups', { token: farmer.token, body: { listingId: bulkListingId, targetQuantity: 10 } });
  const gid = created.data?.data?.groupId;
  const joined = await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 3, address: '12 Test Street', pincode: '520008' } });
  assert.equal(joined.status, 200);
  const left = await api('POST', `/api/bulk/groups/${gid}/leave`, { token: consumer.token });
  assert.equal(left.status, 200);
  assert.equal(left.data?.data?.collectedQuantity, 0);
  const leftAgain = await api('POST', `/api/bulk/groups/${gid}/leave`, { token: consumer.token });
  assert.equal(leftAgain.status, 404);
  await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 2, address: '12 Test Street', pincode: '520008' } });
  const cancelled = await api('POST', `/api/bulk/groups/${gid}/cancel`, { token: farmer.token });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data?.data?.status, 'CANCELLED');
  const afterCancel = await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer2.token, body: { quantity: 1, address: '12 Test Street', pincode: '520008' } });
  assert.equal(afterCancel.status, 409);
});

test('bulk fulfil creates delivery orders and decrements stock', async () => {
  const before = (await api('GET', `/api/listings/${bulkListingId}`)).data?.data?.quantity;
  const done = await api('POST', `/api/bulk/groups/${groupId}/fulfil`, { token: farmer.token });
  assert.equal(done.status, 201);
  assert.equal(done.data?.data?.group?.status, 'COMPLETED');
  assert.equal(done.data?.data?.orders?.length, 3);
  const after = (await api('GET', `/api/listings/${bulkListingId}`)).data?.data?.quantity;
  assert.equal(after, before - 10);
  const history = await api('GET', '/api/orders', { token: consumer.token });
  const bulkOrder = history.data?.data?.find((o) => done.data.data.orders.includes(o.orderId));
  assert.ok(bulkOrder);
  assert.equal(bulkOrder.fulfillment, 'DELIVERY');
  assert.equal(bulkOrder.paymentMethod, 'COD');
  const again = await api('POST', `/api/bulk/groups/${groupId}/fulfil`, { token: farmer.token });
  assert.equal(again.status, 409);
});

test('bulk fulfil fails honestly on insufficient stock', async () => {
  const made = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: 'Scarce Greens', category: 'Leafy', price: 20, quantity: 2, harvestedAt: new Date().toISOString(), pincode: '520008' },
  });
  const lid = made.data?.data?.id;
  const created = await api('POST', '/api/bulk/groups', { token: farmer.token, body: { listingId: lid, targetQuantity: 5 } });
  const gid = created.data?.data?.groupId;
  await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 3, address: '12 Test Street', pincode: '520008' } });
  await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer2.token, body: { quantity: 2, address: '12 Test Street', pincode: '520008' } });
  const done = await api('POST', `/api/bulk/groups/${gid}/fulfil`, { token: farmer.token });
  assert.equal(done.status, 409);
  assert.equal(done.data?.data?.code, 'INSUFFICIENT_STOCK');
});

test('bulk discovery lists open groups', async () => {
  const all = await api('GET', '/api/bulk/groups');
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.data?.data));
  const one = await api('GET', `/api/bulk/groups/${groupId}`);
  assert.equal(one.status, 200);
  assert.equal(one.data?.data?.participantCount, 3);
});

test('forecast is rule-based and honest about sparse data', async () => {
  const report = await api('GET', '/api/farmer/forecast', { token: farmer.token });
  assert.equal(report.status, 200);
  assert.equal(report.data?.data?.method, 'rule-based-30d');
  const tomato = report.data?.data?.products?.find((p) => p.productName === 'Tomato');
  assert.ok(tomato && tomato.soldLast30Days > 0 && tomato.orderCount > 0);
  assert.ok(Number.isFinite(tomato.suggestedRestock));
  const fresh = await api('POST', '/api/auth/register', {
    body: { name: 'New Farmer', email: 'newfarmer@test.farm', password: 'password123', role: 'FARMER' },
  });
  const empty = await api('GET', '/api/farmer/forecast', { token: fresh.data.data.token });
  assert.equal(empty.data?.data?.insufficientData, true);
  const forbidden = await api('GET', '/api/farmer/forecast', { token: consumer.token });
  assert.equal(forbidden.status, 403);
});

test('password reset flow with test mailer', async () => {
  const missing = await api('POST', '/api/auth/forgot', { body: {} });
  assert.equal(missing.status, 400);
  const ok = await api('POST', '/api/auth/forgot', { body: { email: 'consumer@test.farm' } });
  assert.equal(ok.status, 200);
  const token = ok.data?.data?.testOnly?.token;
  assert.ok(token);
  const unknown = await api('POST', '/api/auth/forgot', { body: { email: 'nobody@test.farm' } });
  assert.equal(unknown.status, 200);
  assert.ok(!unknown.data?.data?.testOnly);
  const weak = await api('POST', '/api/auth/reset', { body: { token, password: 'short' } });
  assert.equal(weak.status, 400);
  const done = await api('POST', '/api/auth/reset', { body: { token, password: 'newpassword123' } });
  assert.equal(done.status, 200);
  const reuse = await api('POST', '/api/auth/reset', { body: { token, password: 'anotherpassword123' } });
  assert.equal(reuse.status, 400);
  const login = await api('POST', '/api/auth/login', { body: { email: 'consumer@test.farm', password: 'newpassword123' } });
  assert.equal(login.status, 200);
  consumer.token = login.data.data.token;
});

test('profile update validates and ignores role/email', async () => {
  const anon = await api('PUT', '/api/users/me', { body: { name: 'X' } });
  assert.equal(anon.status, 401);
  const badPin = await api('PUT', '/api/users/me', { token: consumer.token, body: { pincode: '12' } });
  assert.equal(badPin.status, 400);
  const updated = await api('PUT', '/api/users/me', {
    token: consumer.token,
    body: { name: 'Renamed Consumer', phone: '9000000001', location: 'Vijayawada', pincode: '520010', role: 'FARMER', email: 'hacker@test.farm' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data?.data?.name, 'Renamed Consumer');
  assert.equal(updated.data?.data?.pincode, '520010');
  assert.equal(updated.data?.data?.role, 'CONSUMER');
  assert.equal(updated.data?.data?.email, 'consumer@test.farm');
  const me = await api('GET', '/api/auth/me', { token: consumer.token });
  assert.equal(me.data?.data?.phone, '9000000001');
});

test('uploads config reports honestly when unconfigured', async () => {
  const config = await api('GET', '/api/uploads/config');
  assert.equal(config.status, 503);
  const sig = await api('POST', '/api/uploads/signature', { token: farmer.token });
  assert.equal(sig.status, 503);
  const consumerSig = await api('POST', '/api/uploads/signature', { token: consumer.token });
  assert.equal(consumerSig.status, 403);
});

test('community groups: any authenticated user can create', async () => {
  const noName = await api('POST', '/api/bulk/groups', { token: consumer.token, body: { targetQuantity: 10 } });
  assert.equal(noName.status, 400);
  const badTarget = await api('POST', '/api/bulk/groups', { token: consumer.token, body: { productName: 'Mango', targetQuantity: -3 } });
  assert.equal(badTarget.status, 400);
  const created = await api('POST', '/api/bulk/groups', {
    token: consumer.token,
    body: { productName: 'Community Mango', targetQuantity: 12, minPerParticipant: 1, deliveryInfo: 'School ground, Sat 8 AM', pincode: '520008' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data?.data?.model, 'community');
  assert.equal(created.data?.data?.status, 'OPEN');
  assert.equal(created.data?.data?.assignedFarmer, null);
  communityMangoId = created.data?.data?.groupId;
  const farmerMade = await api('POST', '/api/bulk/groups', { token: farmer.token, body: { productName: 'Bulk Tomato', targetQuantity: 10 } });
  assert.equal(farmerMade.status, 201);
  assert.equal(farmerMade.data?.data?.model, 'community');
  communityTomatoId = farmerMade.data?.data?.groupId;
});

test('farmer assignment enforces eligibility and history', async () => {
  const notFarmer = await api('POST', `/api/bulk/groups/${communityTomatoId}/assign`, { token: consumer.token });
  assert.equal(notFarmer.status, 403);
  const ineligible = await api('POST', `/api/bulk/groups/${communityMangoId}/assign`, { token: farmer.token });
  assert.equal(ineligible.status, 409);
  assert.equal(ineligible.data?.data?.code, 'INELIGIBLE_FARMER');
  const assigned = await api('POST', `/api/bulk/groups/${communityTomatoId}/assign`, { token: farmer.token });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.data?.data?.status, 'OPEN');
  assert.equal(assigned.data?.data?.assignedFarmerName, 'Test Farmer');
  assert.equal(assigned.data?.data?.assignmentHistory?.length, 1);
  const dup = await api('POST', `/api/bulk/groups/${communityTomatoId}/assign`, { token: farmer.token });
  assert.equal(dup.status, 409);
  assert.equal(dup.data?.data?.code, 'ALREADY_ASSIGNED');
  await api('POST', `/api/bulk/groups/${communityTomatoId}/join`, { token: consumer.token, body: { quantity: 6, address: '12 Test Street', pincode: '520008' } });
  await api('POST', `/api/bulk/groups/${communityTomatoId}/join`, { token: consumer2.token, body: { quantity: 4, address: '12 Test Street', pincode: '520008' } });
  const full = await api('GET', `/api/bulk/groups/${communityTomatoId}`);
  assert.equal(full.data?.data?.status, 'ASSIGNED');
  const released = await api('POST', `/api/bulk/groups/${communityTomatoId}/unassign`, { token: farmer.token });
  assert.equal(released.status, 200);
  assert.equal(released.data?.data?.status, 'TARGET_REACHED');
  assert.equal(released.data?.data?.assignedFarmer, null);
  assert.equal(released.data?.data?.assignmentHistory?.length, 2);
});

test('bulk joins require delivery addresses and fulfil per-participant', async () => {
  const created = await api('POST', '/api/bulk/groups', {
    token: consumer.token,
    body: { productName: 'Bulk Tomato', targetQuantity: 6, pincode: '520008' },
  });
  const gid = created.data?.data?.groupId;
  const noAddr = await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 3 } });
  assert.equal(noAddr.status, 400);
  assert.equal(noAddr.data?.data?.code, 'INVALID_DELIVERY_ADDRESS');
  const j1 = await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 3, address: '14 Home Street', pincode: '520008' } });
  assert.equal(j1.status, 200);
  const assigned = await api('POST', `/api/bulk/groups/${gid}/assign`, { token: farmer.token });
  assert.equal(assigned.status, 200);
  const j2 = await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer2.token, body: { quantity: 3, address: '9 Other Road', pincode: '520010' } });
  assert.equal(j2.status, 200);
  assert.equal(j2.data?.data?.status, 'ASSIGNED');
  const done = await api('POST', `/api/bulk/groups/${gid}/fulfil`, { token: farmer.token });
  assert.equal(done.status, 201);
  assert.equal(done.data?.data?.group?.status, 'COMPLETED');
  assert.equal(done.data?.data?.orders?.length, 2);
  const detail = await api('GET', `/api/orders/${done.data.data.orders[0]}`, { token: consumer.token });
  assert.equal(detail.data?.data?.fulfillment, 'DELIVERY');
  assert.equal(detail.data?.data?.address, '14 Home Street');
  assert.equal(detail.data?.data?.paymentMethod, 'COD');
});

test('fulfil and assign guards reject invalid states', async () => {
  const fresh = await api('POST', '/api/bulk/groups', { token: farmer.token, body: { listingId: bulkListingId, targetQuantity: 50 } });
  const premature = await api('POST', `/api/bulk/groups/${fresh.data.data.groupId}/fulfil`, { token: farmer.token });
  assert.equal(premature.status, 409);
  assert.equal(premature.data?.data?.code, 'GROUP_NOT_READY');
  const consumerFulfil = await api('POST', `/api/bulk/groups/${communityMangoId}/fulfil`, { token: consumer.token });
  assert.equal(consumerFulfil.status, 403);
  const cancelled = await api('POST', `/api/bulk/groups/${communityMangoId}/cancel`, { token: consumer.token });
  assert.equal(cancelled.status, 200);
  const assignClosed = await api('POST', `/api/bulk/groups/${communityMangoId}/assign`, { token: farmer.token });
  assert.equal(assignClosed.status, 409);
  const joinClosed = await api('POST', `/api/bulk/groups/${communityMangoId}/join`, { token: consumer2.token, body: { quantity: 1, address: '12 Test Street', pincode: '520008' } });
  assert.equal(joinClosed.status, 409);
});

test('consumer creator can cancel their own open group', async () => {
  const created = await api('POST', '/api/bulk/groups', { token: consumer2.token, body: { productName: 'Cancel Greens', targetQuantity: 8 } });
  const gid = created.data?.data?.groupId;
  await api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 2, address: '12 Test Street', pincode: '520008' } });
  const done = await api('POST', `/api/bulk/groups/${gid}/cancel`, { token: consumer2.token });
  assert.equal(done.status, 200);
  assert.equal(done.data?.data?.status, 'CANCELLED');
});

test('concurrent joins never exceed the target', async () => {
  const created = await api('POST', '/api/bulk/groups', { token: farmer.token, body: { listingId: bulkListingId, targetQuantity: 10 } });
  const gid = created.data?.data?.groupId;
  const results = await Promise.all([
    api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer.token, body: { quantity: 6, address: '12 Test Street', pincode: '520008' } }),
    api('POST', `/api/bulk/groups/${gid}/join`, { token: consumer2.token, body: { quantity: 6, address: '12 Test Street', pincode: '520008' } }),
  ]);
  const okCount = results.filter((r) => r.status === 200).length;
  const fullCount = results.filter((r) => r.status === 409 && r.data?.data?.code === 'GROUP_FULL').length;
  assert.equal(okCount, 1);
  assert.equal(fullCount, 1);
  const group = await api('GET', `/api/bulk/groups/${gid}`);
  assert.equal(group.data?.data?.collectedQuantity, 6);
  assert.equal(group.data?.data?.participantCount, 1);
});

test('listing image validation and source labeling', async () => {
  const httpUrl = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: 'Bad Img', price: 5, quantity: 5, harvestedAt: new Date().toISOString(), imageUrl: 'http://example.com/x.jpg' },
  });
  assert.equal(httpUrl.status, 400);
  const badSource = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: 'Bad Src', price: 5, quantity: 5, harvestedAt: new Date().toISOString(), imageUrl: 'https://example.com/x.jpg', imageSource: 'bogus' },
  });
  assert.equal(badSource.status, 400);
  const good = await api('POST', '/api/listings', {
    token: farmer.token,
    body: { productName: 'Photo Peas', price: 15, quantity: 9, harvestedAt: new Date().toISOString(), imageUrl: 'https://example.com/peas.jpg', imageSource: 'photo' },
  });
  assert.equal(good.status, 201);
  assert.equal(good.data?.data?.imageSource, 'photo');
  const badPut = await api('PUT', `/api/listings/${good.data.data.id}`, { token: farmer.token, body: { imageSource: 'nope' } });
  assert.equal(badPut.status, 400);
});

test('farmer profile update works', async () => {
  const updated = await api('PUT', '/api/users/me', { token: farmer.token, body: { farmName: 'Green Acres', pincode: '520008' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data?.data?.farmName, 'Green Acres');
});

test('account deletion requires password and cleans up', async () => {
  const reg = await api('POST', '/api/auth/register', {
    body: { name: 'Leaving Farmer', email: 'leaving@test.farm', password: 'password123', role: 'FARMER' },
  });
  const leavingToken = reg.data.data.token;
  const made = await api('POST', '/api/listings', {
    token: leavingToken,
    body: { productName: 'Goodbye Greens', price: 10, quantity: 5, harvestedAt: new Date().toISOString() },
  });
  const lid = made.data?.data?.id;
  const wrong = await api('DELETE', '/api/users/me', { token: leavingToken, body: { password: 'wrongpassword' } });
  assert.equal(wrong.status, 401);
  const done = await api('DELETE', '/api/users/me', { token: leavingToken, body: { password: 'password123' } });
  assert.equal(done.status, 200);
  const login = await api('POST', '/api/auth/login', { body: { email: 'leaving@test.farm', password: 'password123' } });
  assert.equal(login.status, 401);
  const gone = await api('GET', `/api/listings/${lid}`);
  assert.equal(gone.status, 404);
});
