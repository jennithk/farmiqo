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

if (!jwtSecret) throw new Error('JWT_SECRET is not configured. Run npm run setup:local first.');

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
  paymentStatus: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
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

const User = mongoose.model('User', userSchema);
const Listing = mongoose.model('Listing', listingSchema);
const Cart = mongoose.model('Cart', cartSchema);
const Order = mongoose.model('Order', orderSchema);
const Notification = mongoose.model('Notification', notificationSchema);

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
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(webRoot, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

const response = (res, status, data) => res.status(status).json({ ok: status < 400, data });
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, farmName: user.farmName, location: user.location, pincode: user.pincode });
const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });

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
  rating: farmer.rating,
  completedOrders: farmer.completedOrders,
  verified: farmer.verified,
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
    rating: farmer?.rating || 0,
    verified: farmer?.verified || false,
    farmingMethod: listing.farmingMethod,
    chemicalUsage: listing.chemicalUsage,
    grade: listing.grade,
    img: listing.imageUrl,
    deliveryAvailable: listing.deliveryAvailable,
    pickupAvailable: listing.pickupAvailable,
    status: listing.status,
  };
}

app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return response(res, connected ? 200 : 503, { service: 'farmiqo-api', database: connected ? 'connected' : 'disconnected' });
});
app.use('/api', (req, res, next) => mongoose.connection.readyState === 1
  ? next()
  : response(res, 503, { code: 'DATABASE_UNAVAILABLE', message: 'Marketplace data is unavailable until MONGODB_URI is configured.' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, phone = '', password, role, farmName = '', location = '', pincode = '' } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password || password.length < 8 || !['FARMER', 'CONSUMER'].includes(role)) {
      return response(res, 400, { code: 'INVALID_REGISTRATION', message: 'Name, valid email, role, and password (8+ characters) are required' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: email.trim(), phone, passwordHash, role, farmName, location, pincode });
    return response(res, 201, { user: safeUser(user), token: signToken(user) });
  } catch (error) {
    if (error.code === 11000) return response(res, 409, { code: 'EMAIL_IN_USE', message: 'An account already uses that email' });
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: String(req.body?.email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body?.password || '', user.passwordHash))) {
      return response(res, 401, { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    }
    return response(res, 200, { user: safeUser(user), token: signToken(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', authenticate, (req, res) => response(res, 200, safeUser(req.user)));

app.get('/api/listings', async (req, res, next) => {
  try {
    const filter = { status: 'ACTIVE', quantity: { $gt: 0 } };
    if (req.query.category && req.query.category !== 'All') filter.category = new RegExp(`^${String(req.query.category)}$`, 'i');
    if (req.query.pincode) filter.pincode = String(req.query.pincode);
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;
    if (req.query.minPrice || req.query.maxPrice) filter.price = { ...(req.query.minPrice ? { $gte: Number(req.query.minPrice) } : {}), ...(req.query.maxPrice ? { $lte: Number(req.query.maxPrice) } : {}) };
    let listings = await Listing.find(filter).populate('farmerId').sort({ harvestedAt: -1 }).limit(200);
    if (req.query.q) {
      const query = String(req.query.q).toLowerCase();
      listings = listings.filter((listing) => [listing.productName, listing.farmerId?.name, listing.farmerId?.farmName, listing.category].some((value) => value?.toLowerCase().includes(query)));
    }
    return response(res, 200, listings.map(listingView));
  } catch (error) { next(error); }
});

app.get('/api/listings/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, status: 'ACTIVE' }).populate('farmerId');
    if (!listing) return response(res, 404, { code: 'LISTING_UNAVAILABLE', message: 'Listing is unavailable' });
    return response(res, 200, listingView(listing));
  } catch (error) { next(error); }
});

app.post('/api/listings', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const { productName, category, description = '', price, quantity, minOrderQuantity = 1, maxOrderQuantity, harvestedAt, location = '', pincode = req.user.pincode, farmingMethod, chemicalUsage, grade, imageUrl = '', deliveryAvailable = true, pickupAvailable = true } = req.body || {};
    if (!productName?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isFinite(Number(quantity)) || Number(quantity) < 0 || !harvestedAt) {
      return response(res, 400, { code: 'INVALID_LISTING', message: 'Product, valid price, quantity, and harvest date are required' });
    }
    const listing = await Listing.create({ farmerId: req.user.id, productName: productName.trim(), category, description, price: Number(price), quantity: Number(quantity), minOrderQuantity, maxOrderQuantity, harvestedAt, location, pincode, farmingMethod, chemicalUsage, grade, imageUrl, deliveryAvailable, pickupAvailable });
    const full = await listing.populate('farmerId');
    const data = listingView(full);
    io.emit('listing:created', data);
    return response(res, 201, data);
  } catch (error) { next(error); }
});

app.put('/api/listings/:id', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
    const allowed = ['productName', 'category', 'description', 'price', 'quantity', 'minOrderQuantity', 'maxOrderQuantity', 'harvestedAt', 'availableFrom', 'availableUntil', 'location', 'pincode', 'farmingMethod', 'chemicalUsage', 'grade', 'imageUrl', 'deliveryAvailable', 'pickupAvailable', 'status'];
    const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    if (changes.price !== undefined && Number(changes.price) < 0) return response(res, 400, { code: 'INVALID_PRICE', message: 'Price cannot be negative' });
    if (changes.quantity !== undefined && Number(changes.quantity) < 0) return response(res, 400, { code: 'INVALID_STOCK', message: 'Stock cannot be negative' });
    const listing = await Listing.findOneAndUpdate({ _id: req.params.id, farmerId: req.user.id, status: { $ne: 'DELETED' } }, changes, { new: true, runValidators: true }).populate('farmerId');
    if (!listing) return response(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
    const data = listingView(listing);
    io.emit(changes.quantity !== undefined ? 'listing:stockUpdated' : 'listing:updated', data);
    return response(res, 200, data);
  } catch (error) { next(error); }
});

app.delete('/api/listings/:id', authenticate, requireRole('FARMER'), async (req, res, next) => {
  try {
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
    let created;
    await session.withTransaction(async () => {
      const requestedItems = req.body?.items;
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
      const deliveryFee = Math.max(0, Number(process.env.DELIVERY_FEE || 0));
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
        paymentMethod: req.body?.paymentMethod === 'COD' ? 'COD' : 'UPI_MOCK',
        paymentStatus: 'PENDING',
        status: 'ORDER_PLACED',
        fulfillment: req.body?.fulfillment === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
        address: String(req.body?.address || ''),
        pincode: String(req.body?.pincode || req.user.pincode || ''),
        expectedAt: req.body?.expectedAt || null,
      }], { session });
      if (cart) {
        cart.items = [];
        await cart.save({ session });
      }
      await Notification.insertMany(subOrders.map((subOrder) => ({ userId: subOrder.farmerId, kind: 'order:created', message: `New order ${orderId}`, data: { orderId, subOrderId: subOrder.subOrderId } })), { session });
    });
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
const eventForStatus = { FARMER_ACCEPTED: 'order:accepted', FARMER_REJECTED: 'order:rejected', PREPARING: 'order:preparing', READY_FOR_PICKUP: 'order:ready', OUT_FOR_DELIVERY: 'order:dispatched', DELIVERED: 'order:delivered', COMPLETED: 'order:completed' };

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
      if (nextStatus === 'FARMER_REJECTED') {
        for (const index of subOrder.itemIndexes) {
          const item = order.items[index];
          await Listing.updateOne({ _id: item.listingId }, { $inc: { quantity: item.quantity } }, { session });
        }
      }
      subOrder.status = nextStatus;
      order.status = nextStatus;
      if (nextStatus === 'DELIVERED' && order.paymentMethod === 'COD') {
        order.paymentStatus = 'PAID';
        order.paymentCollectedAt = new Date();
        order.paymentCollectedBy = req.user.name;
        order.paymentCollectedAmount = subOrder.itemIndexes.reduce((sum, index) => sum + order.items[index].subtotal, 0);
      }
      await order.save({ session });
    });
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

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
  res.sendFile(resolve(webRoot, 'index.html'), (error) => error && next(error));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || (error.name === 'ValidationError' ? 400 : 500);
  return response(res, status, { code: error.code || 'INTERNAL_ERROR', message: status === 500 ? 'Unexpected server error' : error.message });
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

if (mongoUri) {
  await mongoose.connect(mongoUri);
} else {
  console.warn('MONGODB_URI is not configured; API data routes will return 503.');
}
server.listen(port, '0.0.0.0', () => console.log(`Farmiqo API listening on ${port}`));
