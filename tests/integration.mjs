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
