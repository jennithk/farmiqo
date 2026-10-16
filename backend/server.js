import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
const mongoUri = process.env.MONGODB_URI;
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const allowedOrigins = new Set([
  'http://localhost:5173',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  ...(process.env.APP_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
]);
const allowOrigin = (origin, callback) => callback(null, !origin || allowedOrigins.has(origin));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowOrigin, credentials: true } });
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET is missing or too short. Run npm run setup:local first.');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT or API_PORT must be a valid TCP port.');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['FARMER', 'CONSUMER'], required: true },
  farmName: { type: String, default: '' },
  location: { type: String, default: '' },
  pincode: { type: String, default: '' },
  rating: { type: Number, default: 5 },
  completedOrders: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

const listingSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productName: { type: String, required: true, trim: true },
  category: { type: String, default: 'Veg', index: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  priceUnit: { type: String, default: 'kg' },
  quantity: { type: Number, required: true, min: 0 },
  minOrderQuantity: { type: Number, default: 1, min: 0 },
  maxOrderQuantity: { type: Number, default: null },
  harvestedAt: { type: Date, required: true },
  availableFrom: { type: Date, default: Date.now },
  availableUntil: { type: Date, default: null },
  location: { type: String, default: '' },
  pincode: { type: String, default: '', index: true },
  farmingMethod: { type: String, default: 'Traditional' },
  chemicalUsage: { type: String, default: 'Not specified' },
  grade: { type: String, default: 'A' },
  imageUrl: { type: String, default: '' },
  imageSource: { type: String, enum: ['', 'photo', 'url', 'ai', 'asset'], default: '' },
  deliveryAvailable: { type: Boolean, default: true },
  pickupAvailable: { type: Boolean, default: true },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'DELETED'], default: 'ACTIVE', index: true },
}, { timestamps: true });

const cartSchema = new mongoose.Schema({
  consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, index: true },
  items: [{ listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }, quantity: { type: Number, min: 0.01 } }],
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, index: true },
  consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  consumerName: String,
  consumerPhone: String,
  items: [{
    listingId: mongoose.Schema.Types.ObjectId,
    farmerId: mongoose.Schema.Types.ObjectId,
    farmerName: String,
    productName: String,
    quantity: Number,
    priceAtPurchase: Number,
    subtotal: Number,
  }],
  subOrders: [{
    subOrderId: String,
    farmerId: mongoose.Schema.Types.ObjectId,
    farmerName: String,
    itemIndexes: [Number],
    status: { type: String, default: 'ORDER_PLACED' },
  }],
  subtotal: Number,
  deliveryFee: Number,
  discount: Number,
  communitySavings: Number,
  total: Number,
  paymentMethod: { type: String, enum: ['COD', 'UPI_MOCK'], required: true },
  paymentStatus: { type: String, enum: ['PENDING', 'PARTIALLY_PAID', 'PAID'], default: 'PENDING' },
  paymentCollectedAt: Date,
  paymentCollectedBy: String,
  paymentCollectedAmount: Number,
  status: { type: String, default: 'ORDER_PLACED', index: true },
  fulfillment: { type: String, enum: ['DELIVERY', 'PICKUP'], default: 'DELIVERY' },
  address: String,
  pincode: String,
  expectedAt: Date,
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  kind: String,
  message: String,
  data: mongoose.Schema.Types.Mixed,
  readAt: Date,
}, { timestamps: true });

const bulkGroupSchema = new mongoose.Schema({
  groupId: { type: String, unique: true, index: true },
  model: { type: String, enum: ['offer', 'community'], default: 'offer', index: true },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedFarmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  assignmentHistory: [{
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    farmerName: String,
    action: { type: String, enum: ['assigned', 'unassigned'], default: 'assigned' },
    assignedBy: String,
    at: { type: Date, default: Date.now },
  }],
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
  productName: String,
  priceAtOffer: Number,
  priceUnit: String,
  imageUrl: String,
  targetQuantity: { type: Number, required: true, min: 0.01 },
  minPerParticipant: { type: Number, default: 1, min: 0.01 },
  maxPerParticipant: { type: Number, default: null },
  slotDate: { type: Date, default: null },
  pickupNote: { type: String, default: '' },
  deliveryInfo: { type: String, default: '' },
  pincode: { type: String, default: '', index: true },
  status: { type: String, enum: ['OPEN', 'TARGET_REACHED', 'ASSIGNED', 'FULFILLING', 'COMPLETED', 'CANCELLED', 'AGGREGATED', 'FULFILLED'], default: 'OPEN', index: true },
  participants: [{
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    consumerName: String,
    quantity: Number,
    address: { type: String, default: '' },
    pincode: { type: String, default: '' },
    joinedAt: { type: Date, default: Date.now },
  }],
  collectedQuantity: { type: Number, default: 0 },
}, { timestamps: true });

const resetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });
resetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model('User', userSchema);
const Listing = mongoose.model('Listing', listingSchema);
const Cart = mongoose.model('Cart', cartSchema);
const Order = mongoose.model('Order', orderSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const BulkGroup = mongoose.model('BulkGroup', bulkGroupSchema);
const PasswordReset = mongoose.model('PasswordReset', resetSchema);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(cors({ origin: allowOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
const authAttempts = new Map();
const authWindowMs = 15 * 60 * 1000;
const authAttemptsLimit = 20;
const authCleanup = setInterval(() => {
  const cutoff = Date.now() - authWindowMs;
  for (const [ip, attempt] of authAttempts) if (attempt.startedAt <= cutoff) authAttempts.delete(ip);
}, 60 * 1000);
authCleanup.unref();
function limitAuthAttempts(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let attempt = authAttempts.get(ip);
  if (!attempt || now - attempt.startedAt >= authWindowMs) {
    attempt = { startedAt: now, count: 0 };
    authAttempts.set(ip, attempt);
  }
  if (attempt.count >= authAttemptsLimit) {
    res.setHeader('Retry-After', String(Math.ceil((authWindowMs - (now - attempt.startedAt)) / 1000)));
    return response(res, 429, { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' });
  }
  attempt.count += 1;
  return next();
}
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(webRoot, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

const response = (res, status, data) => res.status(status).json({ ok: status < 400, data });
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, farmName: user.farmName, location: user.location, pincode: user.pincode });
const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSafeImageUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (!value) return true;
  if (value.startsWith('/assets/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

const testMailOutbox = [];
function mailerConfigured() {
  if (process.env.MAILER_PROVIDER === 'test' && process.env.NODE_ENV !== 'production') return true;
  return Boolean(process.env.BREVO_API_KEY && process.env.RESET_FROM_EMAIL);
}
// Transactional mail via Brevo HTTPS API (Railway free tier blocks outbound SMTP).
// Test hook: MAILER_PROVIDER=test captures mail in memory; honored only outside production.
async function sendMail({ to, subject, html }) {
  if (process.env.MAILER_PROVIDER === 'test' && process.env.NODE_ENV !== 'production') {
    testMailOutbox.push({ to, subject, html });
    return;
  }
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.RESET_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw Object.assign(new Error('Email delivery is not configured'), { status: 503, code: 'EMAIL_DELIVERY_NOT_CONFIGURED' });
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: fromEmail, name: process.env.RESET_FROM_NAME || 'Farmiqo' }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) throw Object.assign(new Error('Email delivery failed'), { status: 502, code: 'EMAIL_DELIVERY_FAILED' });
}
function uploadsConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

// Legacy statuses stay readable: AGGREGATED means TARGET_REACHED, FULFILLED means COMPLETED.
const canonGroupStatus = (status) => status === 'AGGREGATED' ? 'TARGET_REACHED' : status === 'FULFILLED' ? 'COMPLETED' : status;
const READY_STATUSES = ['TARGET_REACHED', 'ASSIGNED', 'AGGREGATED'];

function bulkGroupView(group) {
  const farmer = group.farmerId;
  const assignee = group.assignedFarmerId && typeof group.assignedFarmerId === 'object' ? group.assignedFarmerId : null;
  const supplier = assignee || (group.model === 'offer' ? farmer : null);
  return {
    id: group.id,
    groupId: group.groupId,
    model: group.model,
    productName: group.productName,
    priceAtOffer: group.priceAtOffer,
    priceUnit: group.priceUnit,
    imageUrl: group.imageUrl,
    targetQuantity: group.targetQuantity,
    minPerParticipant: group.minPerParticipant,
    maxPerParticipant: group.maxPerParticipant,
    slotDate: group.slotDate,
    pickupNote: group.pickupNote,
    deliveryInfo: group.deliveryInfo,
    pincode: group.pincode,
    status: group.status,
    participants: (group.participants || []).map((p) => ({ consumerId: String(p.consumerId), consumerName: p.consumerName, quantity: p.quantity })),
    participantCount: (group.participants || []).length,
    collectedQuantity: group.collectedQuantity,
    remainingQuantity: Math.max(0, Math.round((group.targetQuantity - group.collectedQuantity) * 100) / 100),
    farmer: farmer && farmer.name ? farmerSummary(farmer) : null,
    farmerName: farmer?.name || '',
    farmerId: farmer ? String(farmer._id || farmer) : (group.farmerId ? String(group.farmerId._id || group.farmerId) : null),
    assignedFarmer: assignee && assignee.name ? farmerSummary(assignee) : null,
    assignedFarmerId: group.assignedFarmerId ? String(group.assignedFarmerId._id || group.assignedFarmerId) : null,
    assignedFarmerName: assignee?.name || supplier?.name || '',
    assignmentHistory: (group.assignmentHistory || []).map((h) => ({ farmerName: h.farmerName, action: h.action, assignedBy: h.assignedBy, at: h.at })),
    createdAt: group.createdAt,
  };
}

async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return response(res, 401, { code: 'AUTH_REQUIRED', message: 'Authentication required' });
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return response(res, 401, { code: 'INVALID_SESSION', message: 'Session is no longer valid' });
    req.user = user;
    next();
  } catch {
    return response(res, 401, { code: 'INVALID_SESSION', message: 'Session is no longer valid' });
  }
}

const requireRole = (role) => (req, res, next) => req.user.role === role
  ? next()
  : response(res, 403, { code: 'FORBIDDEN', message: 'This account cannot perform that action' });

const farmerSummary = (farmer) => ({
  id: farmer.id,
  name: farmer.name,
  farmName: farmer.farmName,
  location: farmer.location,
  pincode: farmer.pincode,
});

function listingView(listing) {
  const farmer = listing.farmerId;
  return {
    id: listing.id,
    listingId: listing.id,
    name: listing.productName,
    productName: listing.productName,
    category: listing.category,
    description: listing.description,
    price: listing.price,
    priceUnit: listing.priceUnit,
    qty: listing.quantity,
    quantity: listing.quantity,
    minOrderQuantity: listing.minOrderQuantity,
    maxOrderQuantity: listing.maxOrderQuantity,
    harvestedAt: listing.harvestedAt,
    freshness: Math.max(0, Math.floor((Date.now() - listing.harvestedAt.getTime()) / 86400000)),
    location: listing.location || farmer?.location || '',
    pincode: listing.pincode,
    farmer: farmer ? farmerSummary(farmer) : null,
    farmerName: farmer?.name || '',
    farmName: farmer?.farmName || '',
    farmingMethod: listing.farmingMethod,
    chemicalUsage: listing.chemicalUsage,
    grade: listing.grade,
    img: listing.imageUrl,
    imageSource: listing.imageSource || '',
    deliveryAvailable: listing.deliveryAvailable,
    pickupAvailable: listing.pickupAvailable,
    status: listing.status,
  };
}

app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return response(res, connected ? 200 : 503, { service: 'farmiqo-api', database: connected ? 'connected' : 'disconnected' });
});
// Liveness probe for host healthchecks (e.g. Railway healthcheckPath). Always 2xx
// when the process is up, including before the database connects. Readiness stays
// on /api/health, which reports 503 until Atlas is reachable.
app.get('/api/ready', (_req, res) => response(res, 200, { service: 'farmiqo-api', ready: true }));
app.use('/api', (req, res, next) => mongoose.connection.readyState === 1
  ? next()
  : response(res, 503, { code: 'DATABASE_UNAVAILABLE', message: 'Marketplace data is unavailable until MONGODB_URI is configured.' }));

app.post('/api/auth/register', limitAuthAttempts, async (req, res, next) => {
  try {
    const { name, email, phone = '', password, role, farmName = '', location = '', pincode = '' } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (
      typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 ||
      typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 ||
      !['FARMER', 'CONSUMER'].includes(role) ||
      typeof phone !== 'string' || phone.length > 32 ||
      typeof farmName !== 'string' || farmName.length > 120 ||
      typeof location !== 'string' || location.length > 160 ||
      typeof pincode !== 'string' || (pincode && !/^\d{6}$/.test(pincode))
    ) {
      return response(res, 400, { code: 'INVALID_REGISTRATION', message: 'Name, valid email, role, and password (8+ characters) are required' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, phone: phone.trim(), passwordHash, role, farmName: farmName.trim(), location: location.trim(), pincode });
    return response(res, 201, { user: safeUser(user), token: signToken(user) });
  } catch (error) {
    if (error.code === 11000) return response(res, 409, { code: 'EMAIL_IN_USE', message: 'An account already uses that email' });
    next(error);
  }
});

app.post('/api/auth/login', limitAuthAttempts, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email });
    if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) {
      return response(res, 401, { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    }
    return response(res, 200, { user: safeUser(user), token: signToken(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', authenticate, (req, res) => response(res, 200, safeUser(req.user)));

app.put('/api/users/me', authenticate, async (req, res, next) => {
  try {
    // Email and role are intentionally not editable here.
    const { name, phone, farmName, location, pincode } = req.body || {};
    const changes = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) return response(res, 400, { code: 'INVALID_PROFILE', message: 'Name must be 1-100 characters' });
      changes.name = name.trim();
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string' || phone.length > 32) return response(res, 400, { code: 'INVALID_PROFILE', message: 'Phone number is too long' });
      changes.phone = phone.trim();
    }
    if (farmName !== undefined) {
      if (typeof farmName !== 'string' || farmName.length > 120) return response(res, 400, { code: 'INVALID_PROFILE', message: 'Farm name is too long' });
      changes.farmName = farmName.trim();
    }
    if (location !== undefined) {
      if (typeof location !== 'string' || location.length > 160) return response(res, 400, { code: 'INVALID_PROFILE', message: 'Location is too long' });
      changes.location = location.trim();
    }
    if (pincode !== undefined) {
      if (typeof pincode !== 'string' || (pincode && !/^\d{6}$/.test(pincode))) return response(res, 400, { code: 'INVALID_PROFILE', message: 'Pincode must be 6 digits' });
      changes.pincode = pincode;
    }
    if (!Object.keys(changes).length) return response(res, 200, safeUser(req.user));
    const user = await User.findByIdAndUpdate(req.user.id, changes, { new: true, runValidators: true });
    if (!user) return response(res, 401, { code: 'INVALID_SESSION', message: 'Session is no longer valid' });
    return response(res, 200, safeUser(user));
  } catch (error) { next(error); }
});

app.get('/api/listings', async (req, res, next) => {
  try {
    const filter = { status: 'ACTIVE', quantity: { $gt: 0 } };
    if (req.query.category && req.query.category !== 'All') filter.category = new RegExp(`^${escapeRegex(String(req.query.category).slice(0, 50))}$`, 'i');
    if (req.query.pincode) filter.pincode = String(req.query.pincode).slice(0, 6);
    if (req.query.farmerId && mongoose.isValidObjectId(req.query.farmerId)) filter.farmerId = req.query.farmerId;
    if (req.query.minPrice || req.query.maxPrice) {
      const minPrice = req.query.minPrice === undefined ? undefined : Number(req.query.minPrice);
      const maxPrice = req.query.maxPrice === undefined ? undefined : Number(req.query.maxPrice);
      if ((minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
          (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0))) {
        return response(res, 400, { code: 'INVALID_PRICE_FILTER', message: 'Price filters must be non-negative numbers' });
      }
      filter.price = { ...(minPrice !== undefined ? { $gte: minPrice } : {}), ...(maxPrice !== undefined ? { $lte: maxPrice } : {}) };
    }
    let listings = await Listing.find(filter).populate('farmerId').sort({ harvestedAt: -1 }).limit(200);
    if (req.query.q) {
      const query = String(req.query.q).slice(0, 100).toLowerCase();
      listings = listings.filter((listing) => [listing.productName, listing.farmerId?.name, listing.farmerId?.farmName, listing.category].some((value) => value?.toLowerCase().includes(query)));
    }
    return response(res, 200, listings.map(listingView));
  } catch (error) { next(error); }
});

app.get('/api/farmer/listings', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const listings = await Listing.find({ farmerId: req.user.id, status: { $ne: 'DELETED' } })
      .populate('farmerId')
      .sort({ updatedAt: -1 })
      .limit(200);
    return response(res, 200, listings.map(listingView));
  } catch (error) { next(error); }
});

app.get('/api/listings/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return response(res, 404, { code: 'LISTING_UNAVAILABLE', message: 'Listing is unavailable' });
    const listing = await Listing.findOne({ _id: req.params.id, status: 'ACTIVE' }).populate('farmerId');
    if (!listing) return response(res, 404, { code: 'LISTING_UNAVAILABLE', message: 'Listing is unavailable' });
    return response(res, 200, listingView(listing));
  } catch (error) { next(error); }
});

app.post('/api/listings', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const { productName, category, description = '', price, quantity, minOrderQuantity = 1, maxOrderQuantity, harvestedAt, location = '', pincode = req.user.pincode, farmingMethod, chemicalUsage, grade, imageUrl = '', imageSource = '', deliveryAvailable = true, pickupAvailable = true } = req.body || {};
    const minQuantity = Number(minOrderQuantity);
    const maxQuantity = maxOrderQuantity == null || maxOrderQuantity === '' ? null : Number(maxOrderQuantity);
    if (
      typeof productName !== 'string' || !productName.trim() || productName.trim().length > 120 ||
      !Number.isFinite(Number(price)) || Number(price) < 0 ||
      !Number.isFinite(Number(quantity)) || Number(quantity) < 0 ||
      !Number.isFinite(minQuantity) || minQuantity <= 0 ||
      (maxQuantity !== null && (!Number.isFinite(maxQuantity) || maxQuantity < minQuantity)) ||
      (typeof pincode !== 'string' || (pincode && !/^\d{6}$/.test(pincode))) ||
      !isSafeImageUrl(imageUrl) ||
      !['', 'photo', 'url', 'ai', 'asset'].includes(imageSource) ||
      (imageSource === 'ai' && !imageUrl) ||
      !harvestedAt || Number.isNaN(Date.parse(harvestedAt))
    ) {
      return response(res, 400, { code: 'INVALID_LISTING', message: 'Product, valid price, quantity, and harvest date are required' });
    }
    const listing = await Listing.create({ farmerId: req.user.id, productName: productName.trim(), category, description, price: Number(price), quantity: Number(quantity), minOrderQuantity: minQuantity, maxOrderQuantity: maxQuantity, harvestedAt, location, pincode, farmingMethod, chemicalUsage, grade, imageUrl, imageSource, deliveryAvailable, pickupAvailable });
    const full = await listing.populate('farmerId');
    const data = listingView(full);
    io.emit('listing:created', data);
    return response(res, 201, data);
  } catch (error) { next(error); }
});

app.put('/api/listings/:id', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return response(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
    const allowed = ['productName', 'category', 'description', 'price', 'quantity', 'minOrderQuantity', 'maxOrderQuantity', 'harvestedAt', 'availableFrom', 'availableUntil', 'location', 'pincode', 'farmingMethod', 'chemicalUsage', 'grade', 'imageUrl', 'imageSource', 'deliveryAvailable', 'pickupAvailable', 'status'];
    const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    const invalid =
      (changes.productName !== undefined && (typeof changes.productName !== 'string' || !changes.productName.trim() || changes.productName.trim().length > 120)) ||
      (changes.category !== undefined && (typeof changes.category !== 'string' || changes.category.length > 50)) ||
      (changes.description !== undefined && (typeof changes.description !== 'string' || changes.description.length > 2000)) ||
      (changes.price !== undefined && (!Number.isFinite(Number(changes.price)) || Number(changes.price) < 0)) ||
      (changes.quantity !== undefined && (!Number.isFinite(Number(changes.quantity)) || Number(changes.quantity) < 0)) ||
      (changes.minOrderQuantity !== undefined && (!Number.isFinite(Number(changes.minOrderQuantity)) || Number(changes.minOrderQuantity) <= 0)) ||
      (changes.maxOrderQuantity !== undefined && changes.maxOrderQuantity !== null && changes.maxOrderQuantity !== '' && (!Number.isFinite(Number(changes.maxOrderQuantity)) || Number(changes.maxOrderQuantity) < Number(changes.minOrderQuantity ?? 0))) ||
      (changes.pincode !== undefined && (typeof changes.pincode !== 'string' || (changes.pincode && !/^\d{6}$/.test(changes.pincode)))) ||
      (changes.location !== undefined && (typeof changes.location !== 'string' || changes.location.length > 160)) ||
      (changes.farmingMethod !== undefined && (typeof changes.farmingMethod !== 'string' || changes.farmingMethod.length > 80)) ||
      (changes.chemicalUsage !== undefined && (typeof changes.chemicalUsage !== 'string' || changes.chemicalUsage.length > 80)) ||
      (changes.grade !== undefined && (typeof changes.grade !== 'string' || changes.grade.length > 20)) ||
      (changes.imageUrl !== undefined && !isSafeImageUrl(changes.imageUrl)) ||
      (changes.imageSource !== undefined && !['', 'photo', 'url', 'ai', 'asset'].includes(changes.imageSource)) ||
      (['harvestedAt', 'availableFrom', 'availableUntil'].some((key) => changes[key] !== undefined && changes[key] !== null && changes[key] !== '' && Number.isNaN(Date.parse(changes[key]))));
    if (invalid) return response(res, 400, { code: 'INVALID_LISTING', message: 'One or more listing fields are invalid' });
    if (changes.status !== undefined && !['ACTIVE', 'PAUSED'].includes(changes.status)) return response(res, 400, { code: 'INVALID_STATUS', message: 'Status must be ACTIVE or PAUSED. Use the delete route to remove a listing.' });
    const listing = await Listing.findOneAndUpdate({ _id: req.params.id, farmerId: req.user.id, status: { $ne: 'DELETED' } }, changes, { new: true, runValidators: true }).populate('farmerId');
    if (!listing) return response(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
    const data = listingView(listing);
    io.emit(changes.quantity !== undefined ? 'listing:stockUpdated' : 'listing:updated', data);
    return response(res, 200, data);
  } catch (error) { next(error); }
});

app.delete('/api/listings/:id', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return response(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
    const listing = await Listing.findOneAndUpdate({ _id: req.params.id, farmerId: req.user.id, status: { $ne: 'DELETED' } }, { status: 'DELETED' }, { new: true });
    if (!listing) return response(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
    io.emit('listing:updated', { id: listing.id, status: 'DELETED' });
    return response(res, 200, { deleted: true });
  } catch (error) { next(error); }
});

app.get('/api/cart', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ consumerId: req.user.id }).populate({ path: 'items.listingId', populate: { path: 'farmerId' } });
    return response(res, 200, (cart?.items || []).filter((item) => item.listingId?.status === 'ACTIVE').map((item) => ({ listing: listingView(item.listingId), quantity: item.quantity })));
  } catch (error) { next(error); }
});

app.post('/api/cart/items', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  try {
    const listingId = req.body?.listingId;
    const quantity = Number(req.body?.quantity);
    if (!mongoose.isValidObjectId(listingId) || !Number.isFinite(quantity) || quantity <= 0) return response(res, 400, { code: 'INVALID_CART_ITEM', message: 'A valid listing and quantity are required' });
    const listing = await Listing.findOne({ _id: listingId, status: 'ACTIVE', quantity: { $gte: quantity } });
    if (!listing) return response(res, 409, { code: 'INSUFFICIENT_STOCK', message: 'Requested quantity is not available' });
    if (quantity < listing.minOrderQuantity || (listing.maxOrderQuantity != null && quantity > listing.maxOrderQuantity)) {
      return response(res, 400, { code: 'INVALID_ORDER_QUANTITY', message: 'Quantity is outside this listing’s order limits' });
    }
    const cart = await Cart.findOneAndUpdate({ consumerId: req.user.id }, { $setOnInsert: { consumerId: req.user.id } }, { upsert: true, new: true });
    const item = cart.items.find((entry) => String(entry.listingId) === String(listingId));
    if (item) item.quantity = quantity; else cart.items.push({ listingId, quantity });
    await cart.save();
    io.to(`user:${req.user.id}`).emit('cart:updated', { cartId: cart.id });
    return response(res, 200, { listingId, quantity });
  } catch (error) { next(error); }
});

app.put('/api/cart/items/:id', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return response(res, 400, { code: 'INVALID_QUANTITY', message: 'Quantity must be greater than zero' });
    const listing = await Listing.findOne({ _id: req.params.id, status: 'ACTIVE', quantity: { $gte: quantity } });
    if (!listing) return response(res, 409, { code: 'INSUFFICIENT_STOCK', message: 'Requested quantity is not available' });
    if (quantity < listing.minOrderQuantity || (listing.maxOrderQuantity != null && quantity > listing.maxOrderQuantity)) {
      return response(res, 400, { code: 'INVALID_ORDER_QUANTITY', message: 'Quantity is outside this listing’s order limits' });
    }
    const cart = await Cart.findOne({ consumerId: req.user.id });
    const item = cart?.items.find((entry) => String(entry.listingId) === req.params.id);
    if (!item) return response(res, 404, { code: 'CART_ITEM_NOT_FOUND', message: 'Cart item not found' });
    item.quantity = quantity;
    await cart.save();
    return response(res, 200, { listingId: req.params.id, quantity });
  } catch (error) { next(error); }
});

app.delete('/api/cart/items/:id', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  try {
    await Cart.updateOne({ consumerId: req.user.id }, { $pull: { items: { listingId: req.params.id } } });
    return response(res, 200, { deleted: true });
  } catch (error) { next(error); }
});

app.post('/api/orders', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const requestedItems = req.body?.items;
    const paymentMethod = req.body?.paymentMethod;
    const fulfillment = req.body?.fulfillment || 'DELIVERY';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const pincode = typeof req.body?.pincode === 'string' ? req.body.pincode.trim() : req.user.pincode;
    if (requestedItems !== undefined && (!Array.isArray(requestedItems) || requestedItems.length > 100)) {
      return response(res, 400, { code: 'INVALID_ORDER_ITEMS', message: 'Order items must be a list of at most 100 entries' });
    }
    if (!['COD', 'UPI_MOCK'].includes(paymentMethod)) {
      return response(res, 400, { code: 'INVALID_PAYMENT_METHOD', message: 'Choose COD or the simulated UPI option' });
    }
    if (!['DELIVERY', 'PICKUP'].includes(fulfillment)) {
      return response(res, 400, { code: 'INVALID_FULFILLMENT', message: 'Choose delivery or pickup' });
    }
    if (fulfillment === 'DELIVERY' && (!address || address.length > 300 || !/^\d{6}$/.test(pincode || ''))) {
      return response(res, 400, { code: 'INVALID_DELIVERY_ADDRESS', message: 'A delivery address and 6-digit pincode are required' });
    }
    let created;
    let orderAttempts = 0;
    for (;;) {
      try {
        await session.withTransaction(async () => {
          const cart = requestedItems ? null : await Cart.findOne({ consumerId: req.user.id }).session(session);
          const lines = requestedItems || cart?.items.map((item) => ({ listingId: item.listingId, quantity: item.quantity })) || [];
          if (!lines.length) throw Object.assign(new Error('Cart is empty'), { status: 400, code: 'EMPTY_CART' });
          const snapshots = [];
          for (const line of lines) {
            const quantity = Number(line.quantity);
            if (!mongoose.isValidObjectId(line.listingId) || !Number.isFinite(quantity) || quantity <= 0) throw Object.assign(new Error('Invalid item quantity'), { status: 400, code: 'INVALID_QUANTITY' });
            const listing = await Listing.findOneAndUpdate(
              { _id: line.listingId, status: 'ACTIVE', quantity: { $gte: quantity }, minOrderQuantity: { $lte: quantity }, $or: [{ maxOrderQuantity: null }, { maxOrderQuantity: { $gte: quantity } }] },
              { $inc: { quantity: -quantity } },
              { new: true, session }
            ).populate('farmerId').session(session);
            if (!listing) throw Object.assign(new Error('A listing changed or has insufficient stock'), { status: 409, code: 'INSUFFICIENT_STOCK' });
            snapshots.push({ listing, quantity, priceAtPurchase: listing.price });
          }
          const items = snapshots.map(({ listing, quantity, priceAtPurchase }) => ({ listingId: listing.id, farmerId: listing.farmerId.id, farmerName: listing.farmerId.name, productName: listing.productName, quantity, priceAtPurchase, subtotal: priceAtPurchase * quantity }));
          const byFarmer = new Map();
          items.forEach((item, index) => {
            const group = byFarmer.get(String(item.farmerId)) || { farmerId: item.farmerId, farmerName: item.farmerName, itemIndexes: [] };
            group.itemIndexes.push(index);
            byFarmer.set(String(item.farmerId), group);
          });
          const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
          const communitySavings = 0;
          const deliveryFee = Number(process.env.DELIVERY_FEE ?? 0);
          const orderId = `FQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
          const subOrders = [...byFarmer.values()].map((group, index) => ({ ...group, subOrderId: `${orderId}-${String.fromCharCode(65 + index)}` }));
          [created] = await Order.create([{
            orderId,
            consumerId: req.user.id,
            consumerName: req.user.name,
            consumerPhone: req.user.phone,
            items,
            subOrders,
            subtotal,
            deliveryFee,
            discount: 0,
            communitySavings,
            total: Math.max(0, subtotal + deliveryFee - communitySavings),
            paymentMethod,
            paymentStatus: 'PENDING',
            status: 'ORDER_PLACED',
            fulfillment,
            address,
            pincode,
            expectedAt: req.body?.expectedAt || null,
          }], { session });
          if (cart) {
            cart.items = [];
            await cart.save({ session });
          }
          await Notification.insertMany(subOrders.map((subOrder) => ({ userId: subOrder.farmerId, kind: 'order:created', message: `New order ${orderId}`, data: { orderId, subOrderId: subOrder.subOrderId } })), { session });
        });
        break;
      } catch (txError) {
        if (txError?.code === 11000 && orderAttempts < 2) { orderAttempts += 1; continue; }
        throw txError;
      }
    }
    for (const item of created.items) io.emit('listing:stockUpdated', { listingId: String(item.listingId) });
    io.to(`user:${req.user.id}`).emit('order:created', created);
    for (const subOrder of created.subOrders) io.to(`user:${subOrder.farmerId}`).emit('order:created', { order: created, subOrder });
    return response(res, 201, created);
  } catch (error) {
    if (error.code === 'EMPTY_CART' || error.code === 'INVALID_QUANTITY' || error.code === 'INSUFFICIENT_STOCK') return response(res, error.status, { code: error.code, message: error.message });
    next(error);
  } finally { await session.endSession(); }
});

app.get('/api/orders', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  try { return response(res, 200, await Order.find({ consumerId: req.user.id }).sort({ createdAt: -1 })); }
  catch (error) { next(error); }
});

app.get('/api/orders/:id', authenticate, async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return response(res, 404, { code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    const owns = String(order.consumerId) === req.user.id || (req.user.role === 'FARMER' && order.subOrders.some((sub) => String(sub.farmerId) === req.user.id));
    if (!owns) return response(res, 403, { code: 'FORBIDDEN', message: 'You cannot view this order' });
    return response(res, 200, order);
  } catch (error) { next(error); }
});

app.get('/api/farmer/orders', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const orders = await Order.find({ 'subOrders.farmerId': req.user.id }).sort({ createdAt: -1 }).populate('consumerId', 'name phone');
    const relevant = orders.map((order) => ({ order, subOrder: order.subOrders.find((sub) => String(sub.farmerId) === req.user.id) }));
    return response(res, 200, relevant);
  } catch (error) { next(error); }
});

const transitions = {
  ORDER_PLACED: ['FARMER_ACCEPTED', 'FARMER_REJECTED', 'CANCELLED'],
  FARMER_ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'],
  READY_FOR_PICKUP: ['DELIVERED', 'OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  FARMER_REJECTED: [],
  CANCELLED: [],
};
const eventForStatus = { FARMER_ACCEPTED: 'order:accepted', FARMER_REJECTED: 'order:rejected', CANCELLED: 'order:cancelled', PREPARING: 'order:preparing', READY_FOR_PICKUP: 'order:ready', OUT_FOR_DELIVERY: 'order:dispatched', DELIVERED: 'order:delivered', COMPLETED: 'order:completed' };

app.patch('/api/orders/:id/status', authenticate, requireRole('FARMER'), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const nextStatus = req.body?.status;
    if (!Object.hasOwn(transitions, nextStatus)) return response(res, 400, { code: 'INVALID_STATUS', message: 'Unknown order status' });
    let order;
    let subOrder;
    await session.withTransaction(async () => {
      order = await Order.findOne({ orderId: req.params.id, 'subOrders.farmerId': req.user.id }).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404, code: 'ORDER_NOT_FOUND' });
      subOrder = order.subOrders.find((entry) => String(entry.farmerId) === req.user.id);
      if (!transitions[subOrder.status]?.includes(nextStatus)) throw Object.assign(new Error('That order status transition is not allowed'), { status: 409, code: 'INVALID_TRANSITION' });
      if (nextStatus === 'FARMER_REJECTED' || nextStatus === 'CANCELLED') {
        for (const index of subOrder.itemIndexes) {
          const item = order.items[index];
          await Listing.updateOne({ _id: item.listingId }, { $inc: { quantity: item.quantity } }, { session });
        }
      }
      subOrder.status = nextStatus;
      const statuses = order.subOrders.map((entry) => entry.status);
      const terminalStatuses = new Set(['DELIVERED', 'COMPLETED', 'FARMER_REJECTED', 'CANCELLED']);
      const fulfilledStatuses = new Set(['DELIVERED', 'COMPLETED']);
      const allResolved = statuses.every((status) => terminalStatuses.has(status));
      order.status = statuses.every((status) => status === statuses[0])
        ? statuses[0]
        : allResolved
          ? statuses.some((status) => fulfilledStatuses.has(status)) ? 'PARTIALLY_FULFILLED' : 'CANCELLED'
          : statuses.includes('ORDER_PLACED') ? 'ORDER_PLACED' : 'IN_PROGRESS';
      if (order.paymentMethod === 'COD') {
        const excludedStatuses = new Set(['FARMER_REJECTED', 'CANCELLED']);
        const collected = order.subOrders.reduce((sum, entry) => sum + (
          fulfilledStatuses.has(entry.status)
            ? entry.itemIndexes.reduce((amount, index) => amount + order.items[index].subtotal, 0)
            : 0
        ), 0);
        const due = order.subOrders.reduce((sum, entry) => sum + (
          excludedStatuses.has(entry.status)
            ? 0
            : entry.itemIndexes.reduce((amount, index) => amount + order.items[index].subtotal, 0)
        ), 0);
        order.paymentCollectedAmount = collected;
        order.paymentCollectedBy = collected ? req.user.name : undefined;
        order.paymentCollectedAt = collected ? new Date() : undefined;
        order.paymentStatus = collected >= due && allResolved && collected > 0
          ? 'PAID'
          : collected > 0 ? 'PARTIALLY_PAID' : 'PENDING';
      }
      await order.save({ session });
    });
    if (nextStatus === 'FARMER_REJECTED' || nextStatus === 'CANCELLED') {
      for (const index of subOrder.itemIndexes) io.emit('listing:stockUpdated', { listingId: String(order.items[index].listingId) });
    }
    const event = eventForStatus[nextStatus];
    io.to(`user:${order.consumerId}`).emit(event, order);
    io.to(`user:${req.user.id}`).emit(event, order);
    io.to(`user:${order.consumerId}`).emit('notification:new', { kind: event, orderId: order.orderId });
    return response(res, 200, order);
  } catch (error) {
    if (['ORDER_NOT_FOUND', 'INVALID_TRANSITION'].includes(error.code)) return response(res, error.status, { code: error.code, message: error.message });
    next(error);
  } finally { await session.endSession(); }
});

app.get('/api/notifications', authenticate, async (req, res, next) => {
  try { return response(res, 200, await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)); }
  catch (error) { next(error); }
});

app.post('/api/bulk/groups', authenticate, async (req, res, next) => {
  try {
    const { listingId, productName, targetQuantity, minPerParticipant, maxPerParticipant, slotDate, pickupNote = '', deliveryInfo = '', pincode } = req.body || {};
    // Model 2 (farmer offer): bound to one of the farmer's active listings.
    // Model 1 (community): any authenticated user; product is named, farmer assigned later.
    let listing = null;
    if (listingId !== undefined && listingId !== null && listingId !== '') {
      if (req.user.role !== 'FARMER') return response(res, 403, { code: 'FORBIDDEN', message: 'Only farmers can offer their own listings' });
      if (!mongoose.isValidObjectId(listingId)) return response(res, 400, { code: 'INVALID_LISTING', message: 'A valid listing is required' });
      listing = await Listing.findOne({ _id: listingId, farmerId: req.user.id, status: 'ACTIVE' });
      if (!listing) return response(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Active listing not found' });
    } else if (req.user.role === 'FARMER' && typeof productName !== 'string') {
      return response(res, 400, { code: 'INVALID_LISTING', message: 'A valid listing is required' });
    }
    const name = listing ? listing.productName : (typeof productName === 'string' ? productName.trim() : '');
    if (!name || name.length > 120) return response(res, 400, { code: 'INVALID_BULK_GROUP', message: 'A product name of 1-120 characters is required' });
    const target = Number(targetQuantity);
    const minShare = minPerParticipant === undefined || minPerParticipant === '' ? (listing ? Number(listing.minOrderQuantity) || 1 : 1) : Number(minPerParticipant);
    const maxShare = maxPerParticipant == null || maxPerParticipant === '' ? null : Number(maxPerParticipant);
    if (
      !Number.isFinite(target) || target <= 0 || target > 100000 ||
      !Number.isFinite(minShare) || minShare <= 0 ||
      (maxShare !== null && (!Number.isFinite(maxShare) || maxShare < minShare)) ||
      (slotDate !== undefined && slotDate !== null && slotDate !== '' && Number.isNaN(Date.parse(slotDate))) ||
      typeof pickupNote !== 'string' || pickupNote.length > 300 ||
      typeof deliveryInfo !== 'string' || deliveryInfo.length > 300 ||
      (pincode !== undefined && (typeof pincode !== 'string' || (pincode && !/^\d{6}$/.test(pincode))))
    ) {
      return response(res, 400, { code: 'INVALID_BULK_GROUP', message: 'Target quantity, share limits, and pickup details are invalid' });
    }
    let created;
    for (let attempts = 0; ; attempts++) {
      try {
        [created] = await BulkGroup.create([{
          groupId: `BG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          model: listing ? 'offer' : 'community',
          farmerId: req.user.id,
          assignedFarmerId: listing ? req.user.id : null,
          assignmentHistory: listing ? [{ farmerId: req.user.id, farmerName: req.user.name, action: 'assigned', assignedBy: 'owner' }] : [],
          listingId: listing ? listing.id : null,
          productName: name,
          priceAtOffer: listing ? listing.price : null,
          priceUnit: listing ? listing.priceUnit : 'kg',
          imageUrl: listing ? listing.imageUrl : '',
          targetQuantity: Math.round(target * 100) / 100,
          minPerParticipant: Math.round(minShare * 100) / 100,
          maxPerParticipant: maxShare,
          slotDate: slotDate || null,
          pickupNote: pickupNote.trim(),
          deliveryInfo: deliveryInfo.trim(),
          pincode: pincode || (listing ? listing.pincode : '') || req.user.pincode || '',
        }]);
        break;
      } catch (error) {
        if (error.code === 11000 && attempts < 2) continue;
        throw error;
      }
    }
    const full = await created.populate(['farmerId', 'assignedFarmerId']);
    const data = bulkGroupView(full);
    io.emit('bulk:updated', { groupId: data.groupId, status: data.status });
    return response(res, 201, data);
  } catch (error) { next(error); }
});

app.get('/api/bulk/groups', async (req, res, next) => {
  try {
    const filter = {};
    const status = String(req.query.status || 'OPEN').toUpperCase();
    if (['OPEN', 'TARGET_REACHED', 'ASSIGNED', 'FULFILLING', 'COMPLETED', 'CANCELLED', 'AGGREGATED', 'FULFILLED'].includes(status)) filter.status = status;
    else if (status !== 'ALL') filter.status = 'OPEN';
    if (req.query.model === 'offer' || req.query.model === 'community') filter.model = req.query.model;
    if (req.query.pincode) filter.pincode = String(req.query.pincode).slice(0, 6);
    if (req.query.farmerId && mongoose.isValidObjectId(req.query.farmerId)) filter.farmerId = req.query.farmerId;
    if (req.query.assignedFarmerId && mongoose.isValidObjectId(req.query.assignedFarmerId)) filter.assignedFarmerId = req.query.assignedFarmerId;
    const groups = await BulkGroup.find(filter).populate(['farmerId', 'assignedFarmerId']).sort({ createdAt: -1 }).limit(200);
    return response(res, 200, groups.map(bulkGroupView));
  } catch (error) { next(error); }
});

app.get('/api/bulk/groups/:id', async (req, res, next) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    const group = await BulkGroup.findOne(query).populate(['farmerId', 'assignedFarmerId']);
    if (!group) return response(res, 404, { code: 'GROUP_NOT_FOUND', message: 'Bulk group not found' });
    return response(res, 200, bulkGroupView(group));
  } catch (error) { next(error); }
});

app.post('/api/bulk/groups/:id/join', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  try {
    const rawQty = Number(req.body?.quantity);
    if (!Number.isFinite(rawQty) || rawQty <= 0) return response(res, 400, { code: 'INVALID_QUANTITY', message: 'Quantity must be greater than zero' });
    const quantity = Math.round(rawQty * 100) / 100;
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    const candidate = await BulkGroup.findOne(query);
    if (!candidate) return response(res, 404, { code: 'GROUP_NOT_FOUND', message: 'Bulk group not found' });
    if (quantity < candidate.minPerParticipant || (candidate.maxPerParticipant != null && quantity > candidate.maxPerParticipant)) {
      return response(res, 400, { code: 'INVALID_SHARE', message: 'Quantity is outside this group’s per-person limits' });
    }
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const participantPincode = typeof req.body?.pincode === 'string' ? req.body.pincode.trim() : '';
    if (!address || address.length > 300 || !/^\d{6}$/.test(participantPincode)) {
      return response(res, 400, { code: 'INVALID_DELIVERY_ADDRESS', message: 'A delivery address and 6-digit pincode are required to join' });
    }
    const updated = await BulkGroup.findOneAndUpdate(
      { ...query, status: 'OPEN', 'participants.consumerId': { $ne: req.user.id }, collectedQuantity: { $lte: candidate.targetQuantity - quantity } },
      { $inc: { collectedQuantity: quantity }, $push: { participants: { consumerId: req.user.id, consumerName: req.user.name, quantity, address, pincode: participantPincode, joinedAt: new Date() } } },
      { new: true },
    ).populate(['farmerId', 'assignedFarmerId']);
    if (!updated) {
      const current = await BulkGroup.findOne(query);
      if (!current) return response(res, 404, { code: 'GROUP_NOT_FOUND', message: 'Bulk group not found' });
      if (current.status !== 'OPEN') return response(res, 409, { code: 'GROUP_CLOSED', message: 'This group is no longer open' });
      if (current.participants.some((p) => String(p.consumerId) === req.user.id)) return response(res, 409, { code: 'ALREADY_JOINED', message: 'You already joined this group' });
      return response(res, 409, { code: 'GROUP_FULL', message: 'Not enough remaining quantity in this group' });
    }
    let data = bulkGroupView(updated);
    if (updated.collectedQuantity >= updated.targetQuantity - 1e-9) {
      const nextStatus = updated.assignedFarmerId ? 'ASSIGNED' : 'TARGET_REACHED';
      const aggregated = await BulkGroup.findOneAndUpdate({ _id: updated.id, status: 'OPEN' }, { status: nextStatus }, { new: true }).populate(['farmerId', 'assignedFarmerId']);
      if (aggregated) {
        data = bulkGroupView(aggregated);
        const notifyId = String(aggregated.assignedFarmerId?._id || aggregated.assignedFarmerId || aggregated.farmerId?._id || aggregated.farmerId);
        await Notification.create({ userId: notifyId, kind: 'bulk:aggregated', message: `Group ${aggregated.groupId} reached its target`, data: { groupId: aggregated.groupId } });
        io.to(`user:${notifyId}`).emit('notification:new', { kind: 'bulk:aggregated', groupId: aggregated.groupId });
      }
    }
    io.emit('bulk:updated', { groupId: data.groupId, status: data.status });
    return response(res, 200, data);
  } catch (error) { next(error); }
});

app.post('/api/bulk/groups/:id/leave', authenticate, requireRole('CONSUMER'), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    let data;
    await session.withTransaction(async () => {
      const group = await BulkGroup.findOne(query).session(session);
      if (!group) throw Object.assign(new Error('Bulk group not found'), { status: 404, code: 'GROUP_NOT_FOUND' });
      if (group.status !== 'OPEN') throw Object.assign(new Error('Only open groups can be left'), { status: 409, code: 'GROUP_CLOSED' });
      const index = group.participants.findIndex((p) => String(p.consumerId) === req.user.id);
      if (index === -1) throw Object.assign(new Error('You are not in this group'), { status: 404, code: 'NOT_PARTICIPANT' });
      const [removed] = group.participants.splice(index, 1);
      group.collectedQuantity = Math.max(0, Math.round((group.collectedQuantity - removed.quantity) * 100) / 100);
      await group.save({ session });
      await group.populate('farmerId');
      data = bulkGroupView(group);
    });
    io.emit('bulk:updated', { groupId: data.groupId, status: data.status });
    return response(res, 200, data);
  } catch (error) {
    if (['GROUP_NOT_FOUND', 'GROUP_CLOSED', 'NOT_PARTICIPANT'].includes(error.code)) return response(res, error.status, { code: error.code, message: error.message });
    next(error);
  } finally { await session.endSession(); }
});

app.post('/api/bulk/groups/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    const existing = await BulkGroup.findOne(query);
    if (!existing) return response(res, 404, { code: 'GROUP_NOT_FOUND', message: 'Bulk group not found' });
    const isManager = String(existing.farmerId) === req.user.id || String(existing.assignedFarmerId || '') === req.user.id;
    if (!isManager) return response(res, 403, { code: 'FORBIDDEN', message: 'Only the group creator or assigned farmer can cancel it' });
    if (!['OPEN', 'TARGET_REACHED', 'ASSIGNED', 'AGGREGATED'].includes(existing.status)) {
      return response(res, 409, { code: 'GROUP_NOT_CANCELLABLE', message: 'Only open or assigned groups can be cancelled' });
    }
    const group = await BulkGroup.findOneAndUpdate({ _id: existing.id }, { status: 'CANCELLED' }, { new: true }).populate(['farmerId', 'assignedFarmerId']);
    if (group.participants.length) {
      await Notification.insertMany(group.participants.map((p) => ({ userId: p.consumerId, kind: 'bulk:cancelled', message: `Group ${group.groupId} was cancelled`, data: { groupId: group.groupId } })));
      for (const p of group.participants) io.to(`user:${p.consumerId}`).emit('notification:new', { kind: 'bulk:cancelled', groupId: group.groupId });
    }
    const data = bulkGroupView(group);
    io.emit('bulk:updated', { groupId: data.groupId, status: data.status });
    return response(res, 200, data);
  } catch (error) { next(error); }
});

app.post('/api/bulk/groups/:id/assign', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    const group = await BulkGroup.findOne(query);
    if (!group) return response(res, 404, { code: 'GROUP_NOT_FOUND', message: 'Bulk group not found' });
    if (group.assignedFarmerId) return response(res, 409, { code: 'ALREADY_ASSIGNED', message: 'This group already has a farmer' });
    if (!['OPEN', 'TARGET_REACHED', 'AGGREGATED'].includes(group.status)) {
      return response(res, 409, { code: 'GROUP_NOT_READY', message: 'Only open or target-reached groups can take a farmer' });
    }
    const remaining = group.targetQuantity - group.collectedQuantity;
    const eligible = await Listing.findOne({
      farmerId: req.user.id,
      status: 'ACTIVE',
      productName: new RegExp(`^${escapeRegex(group.productName)}$`, 'i'),
      quantity: { $gte: Math.max(0, remaining) },
    });
    if (!eligible) return response(res, 409, { code: 'INELIGIBLE_FARMER', message: 'You need an active listing of this product with enough stock' });
    group.assignedFarmerId = req.user.id;
    group.assignmentHistory.push({ farmerId: req.user.id, farmerName: req.user.name, action: 'assigned', assignedBy: 'self' });
    if (['TARGET_REACHED', 'AGGREGATED'].includes(group.status)) group.status = 'ASSIGNED';
    await group.save();
    await group.populate(['farmerId', 'assignedFarmerId']);
    if (String(group.farmerId?._id || group.farmerId) !== req.user.id) {
      const creatorId = String(group.farmerId?._id || group.farmerId);
      await Notification.create({ userId: creatorId, kind: 'bulk:assigned', message: `${req.user.name} will supply group ${group.groupId}`, data: { groupId: group.groupId } });
      io.to(`user:${creatorId}`).emit('notification:new', { kind: 'bulk:assigned', groupId: group.groupId });
    }
    const data = bulkGroupView(group);
    io.emit('bulk:updated', { groupId: data.groupId, status: data.status });
    return response(res, 200, data);
  } catch (error) { next(error); }
});

app.post('/api/bulk/groups/:id/unassign', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    const group = await BulkGroup.findOne(query);
    if (!group) return response(res, 404, { code: 'GROUP_NOT_FOUND', message: 'Bulk group not found' });
    if (String(group.assignedFarmerId || '') !== req.user.id) return response(res, 409, { code: 'NOT_ASSIGNED', message: 'You are not assigned to this group' });
    if (!['ASSIGNED', 'TARGET_REACHED', 'AGGREGATED', 'OPEN'].includes(group.status)) {
      return response(res, 409, { code: 'GROUP_NOT_READY', message: 'This group can no longer release its farmer' });
    }
    group.assignedFarmerId = null;
    group.assignmentHistory.push({ farmerId: req.user.id, farmerName: req.user.name, action: 'unassigned', assignedBy: 'self' });
    if (group.status === 'ASSIGNED') group.status = 'TARGET_REACHED';
    await group.save();
    await group.populate(['farmerId', 'assignedFarmerId']);
    const data = bulkGroupView(group);
    io.emit('bulk:updated', { groupId: data.groupId, status: data.status });
    return response(res, 200, data);
  } catch (error) { next(error); }
});

app.post('/api/bulk/groups/:id/fulfil', authenticate, requireRole('FARMER'), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { groupId: req.params.id };
    let group;
    let createdOrders = [];
    let attempts = 0;
    for (;;) {
      try {
        await session.withTransaction(async () => {
          group = await BulkGroup.findOne(query).session(session);
          if (!group) throw Object.assign(new Error('Group not found'), { status: 404, code: 'GROUP_NOT_FOUND' });
          const assigneeId = String(group.assignedFarmerId || '');
          const isAssignee = assigneeId === req.user.id;
          const isLegacyOwner = !group.assignedFarmerId && String(group.farmerId) === req.user.id;
          if (!isAssignee && !isLegacyOwner) throw Object.assign(new Error('Only the assigned farmer can fulfil this group'), { status: 403, code: 'FORBIDDEN' });
          if (!['ASSIGNED', 'TARGET_REACHED', 'AGGREGATED'].includes(group.status)) throw Object.assign(new Error('Only assigned target-reached groups can be fulfilled'), { status: 409, code: 'GROUP_NOT_READY' });
          if (!group.participants.length) throw Object.assign(new Error('Group has no participants'), { status: 409, code: 'GROUP_EMPTY' });
          const supplierId = group.assignedFarmerId || group.farmerId;
          let listing;
          if (group.listingId) {
            listing = await Listing.findOneAndUpdate(
              { _id: group.listingId, farmerId: supplierId, status: 'ACTIVE', quantity: { $gte: group.collectedQuantity } },
              { $inc: { quantity: -group.collectedQuantity } },
              { new: true, session },
            );
          } else {
            const candidates = await Listing.find({
              farmerId: supplierId,
              status: 'ACTIVE',
              productName: new RegExp(`^${escapeRegex(group.productName)}$`, 'i'),
              quantity: { $gte: group.collectedQuantity },
            }).sort({ quantity: -1 }).session(session);
            if (candidates.length) {
              listing = await Listing.findOneAndUpdate(
                { _id: candidates[0].id, quantity: { $gte: group.collectedQuantity } },
                { $inc: { quantity: -group.collectedQuantity } },
                { new: true, session },
              );
            }
          }
          if (!listing) throw Object.assign(new Error('Insufficient stock to fulfil this group'), { status: 409, code: 'INSUFFICIENT_STOCK' });
          const supplier = await User.findById(supplierId).session(session);
          group.priceAtOffer = group.priceAtOffer ?? listing.price;
          group.priceUnit = group.priceUnit || listing.priceUnit;
          createdOrders = [];
          for (const participant of group.participants) {
            const share = participant.quantity;
            if (!participant.address || !/^\d{6}$/.test(participant.pincode || '')) {
              throw Object.assign(new Error('A participant is missing a delivery address'), { status: 409, code: 'ADDRESS_REQUIRED' });
            }
            const subtotal = listing.price * share;
            const orderId = `FQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
            const [created] = await Order.create([{
              orderId,
              consumerId: participant.consumerId,
              consumerName: participant.consumerName,
              consumerPhone: '',
              items: [{ listingId: listing.id, farmerId: supplierId, farmerName: supplier?.name || req.user.name, productName: listing.productName, quantity: share, priceAtPurchase: listing.price, subtotal }],
              subOrders: [{ subOrderId: `${orderId}-A`, farmerId: supplierId, farmerName: supplier?.name || req.user.name, itemIndexes: [0], status: 'ORDER_PLACED' }],
              subtotal,
              deliveryFee: 0,
              discount: 0,
              communitySavings: 0,
              total: Math.max(0, subtotal + Number(process.env.DELIVERY_FEE ?? 0)),
              paymentMethod: 'COD',
              paymentStatus: 'PENDING',
              status: 'ORDER_PLACED',
              fulfillment: 'DELIVERY',
              address: participant.address,
              pincode: participant.pincode,
              expectedAt: group.slotDate || null,
            }], { session });
            createdOrders.push(created);
          }
          group.status = 'COMPLETED';
          await group.save({ session });
          await Notification.insertMany(createdOrders.map((order) => ({ userId: order.consumerId, kind: 'order:created', message: `Bulk group ${group.groupId} order is out for delivery`, data: { orderId: order.orderId, groupId: group.groupId } })), { session });
        });
        break;
      } catch (txError) {
        if (txError?.code === 11000 && attempts < 2) { attempts += 1; continue; }
        throw txError;
      }
    }
    for (const order of createdOrders) {
      io.to(`user:${order.consumerId}`).emit('order:created', order);
      io.to(`user:${order.consumerId}`).emit('notification:new', { kind: 'order:created', orderId: order.orderId });
    }
    io.emit('bulk:updated', { groupId: group.groupId, status: 'COMPLETED' });
    io.emit('listing:stockUpdated', { listingId: String(group.listingId) });
    await group.populate(['farmerId', 'assignedFarmerId']);
    return response(res, 201, { group: bulkGroupView(group), orders: createdOrders.map((o) => o.orderId) });
  } catch (error) {
    if (['GROUP_NOT_FOUND', 'GROUP_NOT_READY', 'GROUP_EMPTY', 'INSUFFICIENT_STOCK', 'ADDRESS_REQUIRED', 'FORBIDDEN'].includes(error.code)) return response(res, error.status, { code: error.code, message: error.message });
    next(error);
  } finally { await session.endSession(); }
});

app.get('/api/farmer/forecast', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    // Rule-based MVP over the farmer's own sales. Labeled honestly: no ML involved.
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 86400000);
    const orders = await Order.find({ 'subOrders.farmerId': req.user.id, createdAt: { $gte: since } });
    const sales = new Map();
    for (const order of orders) {
      const sub = order.subOrders.find((entry) => String(entry.farmerId) === req.user.id);
      if (!sub || ['FARMER_REJECTED', 'CANCELLED'].includes(sub.status)) continue;
      for (const index of sub.itemIndexes) {
        const item = order.items[index];
        if (!item) continue;
        const entry = sales.get(item.productName) || { quantity: 0, orders: 0 };
        entry.quantity += item.quantity;
        entry.orders += 1;
        sales.set(item.productName, entry);
      }
    }
    const listings = await Listing.find({ farmerId: req.user.id, status: 'ACTIVE' });
    const inventory = new Map();
    for (const listing of listings) inventory.set(listing.productName, (inventory.get(listing.productName) || 0) + listing.quantity);
    const names = [...new Set([...sales.keys(), ...inventory.keys()])].sort();
    const products = names.map((productName) => {
      const sold = sales.get(productName)?.quantity || 0;
      const orderCount = sales.get(productName)?.orders || 0;
      const avgWeekly = Math.round((sold / (windowDays / 7)) * 100) / 100;
      const stock = Math.round((inventory.get(productName) || 0) * 100) / 100;
      return { productName, soldLast30Days: Math.round(sold * 100) / 100, orderCount, avgWeeklySales: avgWeekly, activeInventory: stock, suggestedRestock: Math.max(0, Math.ceil(avgWeekly * 1.25 - stock)) };
    });
    return response(res, 200, {
      method: 'rule-based-30d',
      windowDays,
      generatedAt: new Date().toISOString(),
      insufficientData: products.every((p) => p.soldLast30Days === 0),
      products,
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/forgot', limitAuthAttempts, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) return response(res, 400, { code: 'INVALID_EMAIL', message: 'An email address is required' });
    if (!mailerConfigured()) return response(res, 503, { code: 'EMAIL_DELIVERY_NOT_CONFIGURED', message: 'Password reset is unavailable right now. Please try again later.' });
    const user = await User.findOne({ email });
    // Generic response either way so accounts cannot be enumerated.
    if (!user) return response(res, 200, { sent: true });
    const token = crypto.randomBytes(32).toString('hex');
    await PasswordReset.create({ userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    const base = (process.env.APP_PUBLIC_URL || '').split(',')[0]?.trim() || 'https://farmiqo-production.up.railway.app';
    await sendMail({
      to: user.email,
      subject: 'Reset your Farmiqo password',
      html: `<p>Hello ${user.name},</p><p>Use this link within 1 hour to set a new password:</p><p><a href="${base}/#reset=${token}">${base}/#reset=…</a></p><p>If you did not request this, ignore this email.</p>`,
    });
    // Test hook only: lets automated tests complete the flow without an inbox.
    // Double-gated so production can never expose the token.
    if (process.env.MAILER_PROVIDER === 'test' && process.env.NODE_ENV === 'test') {
      return response(res, 200, { sent: true, testOnly: { token } });
    }
    return response(res, 200, { sent: true });
  } catch (error) {
    if (error.code === 'EMAIL_DELIVERY_NOT_CONFIGURED' || error.code === 'EMAIL_DELIVERY_FAILED') return response(res, error.status, { code: error.code, message: error.message });
    next(error);
  }
});

app.post('/api/auth/reset', limitAuthAttempts, async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!token || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return response(res, 400, { code: 'INVALID_RESET', message: 'A valid reset token and password (8+ characters) are required' });
    }
    const record = await PasswordReset.findOne({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), usedAt: null, expiresAt: { $gt: new Date() } });
    if (!record) return response(res, 400, { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'This reset link is invalid or has expired' });
    record.usedAt = new Date();
    await record.save();
    await User.updateOne({ _id: record.userId }, { passwordHash: await bcrypt.hash(password, 12) });
    return response(res, 200, { reset: true });
  } catch (error) { next(error); }
});

app.get('/api/uploads/config', async (req, res, next) => {
  try {
    if (!uploadsConfigured()) return response(res, 503, { code: 'UPLOAD_NOT_CONFIGURED', message: 'Image uploads are unavailable right now' });
    return response(res, 200, { provider: 'cloudinary', cloudName: process.env.CLOUDINARY_CLOUD_NAME });
  } catch (error) { next(error); }
});

app.post('/api/uploads/signature', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    if (!uploadsConfigured()) return response(res, 503, { code: 'UPLOAD_NOT_CONFIGURED', message: 'Image uploads are unavailable right now' });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `farmiqo/${req.user.id}`;
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
    return response(res, 200, { provider: 'cloudinary', cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, timestamp, folder, signature });
  } catch (error) { next(error); }
});

app.delete('/api/users/me', authenticate, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !(await bcrypt.compare(password, req.user.passwordHash))) {
      return response(res, 401, { code: 'INVALID_CREDENTIALS', message: 'Password confirmation failed' });
    }
    await session.withTransaction(async () => {
      if (req.user.role === 'FARMER') {
        await Listing.updateMany({ farmerId: req.user.id, status: { $ne: 'DELETED' } }, { status: 'DELETED' }, { session });
        await BulkGroup.updateMany({ farmerId: req.user.id, status: { $in: ['OPEN', 'TARGET_REACHED', 'ASSIGNED', 'AGGREGATED'] } }, { status: 'CANCELLED' }, { session });
      } else {
        const openGroups = await BulkGroup.find({ status: 'OPEN', 'participants.consumerId': req.user.id }).session(session);
        for (const group of openGroups) {
          const entry = group.participants.find((p) => String(p.consumerId) === req.user.id);
          group.participants = group.participants.filter((p) => String(p.consumerId) !== req.user.id);
          group.collectedQuantity = Math.max(0, Math.round((group.collectedQuantity - (entry?.quantity || 0)) * 100) / 100);
          await group.save({ session });
        }
        await Cart.deleteOne({ consumerId: req.user.id }, { session });
      }
      await Notification.deleteMany({ userId: req.user.id }, { session });
      await PasswordReset.deleteMany({ userId: req.user.id }, { session });
      await User.deleteOne({ _id: req.user.id }, { session });
    });
    return response(res, 200, { deleted: true });
  } catch (error) { next(error); }
  finally { await session.endSession(); }
});

app.use('/api', (_req, res) => response(res, 404, { code: 'NOT_FOUND', message: 'API route not found' }));

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
  res.sendFile(resolve(webRoot, 'index.html'), (error) => error && next(error));
});

app.use((error, _req, res, _next) => {
  console.error('API request failed', { name: error.name, code: error.code });
  const status = error.status || (['ValidationError', 'CastError', 'SyntaxError'].includes(error.name) ? 400 : 500);
  const code = status === 400 ? 'INVALID_REQUEST' : status === 500 ? 'INTERNAL_ERROR' : error.code || 'REQUEST_FAILED';
  const message = status === 400 ? 'Request validation failed' : status === 500 ? 'Unexpected server error' : error.message;
  return response(res, status, { code, message });
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    socket.user = jwt.verify(token, jwtSecret);
    return next();
  } catch { return next(new Error('Invalid session')); }
});
io.on('connection', (socket) => socket.join(`user:${socket.user.sub}`));

if (!Number.isFinite(Number(process.env.DELIVERY_FEE ?? 0)) || Number(process.env.DELIVERY_FEE ?? 0) < 0) {
  throw new Error('DELIVERY_FEE must be a non-negative number.');
}

let reconnectTimer;
let shuttingDown = false;
async function connectDatabase() {
  if (!mongoUri) {
  console.warn('MONGODB_URI is not configured; API data routes will return 503.');
    return;
  }
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed; retrying', { name: error.name, code: error.code });
    if (!shuttingDown) {
      reconnectTimer = setTimeout(connectDatabase, 5000);
      reconnectTimer.unref();
    }
  }
}

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error', { name: error.name, code: error.code });
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected; waiting for driver reconnection');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Farmiqo API listening on ${port}`);
  void connectDatabase();
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  console.log(`Shutting down after ${signal}`);
  io.close(async () => {
    await mongoose.disconnect();
    process.exitCode = 0;
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
