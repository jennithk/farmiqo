import { io } from 'socket.io-client';

const API_ROOT = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'farmiqo-session-token';
let socket;

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new ApiError(body.data?.message || body.message || 'Request failed', response.status, body.data?.code || body.code);
    }
    return body.data;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('The request timed out. Check your connection and try again.', 408, 'TIMEOUT');
    if (error instanceof TypeError) throw new ApiError('Unable to connect. Check your internet connection.', 0, 'NETWORK_ERROR');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function authenticate(path, values) {
  const result = await request(path, { method: 'POST', body: JSON.stringify(values) });
  localStorage.setItem(TOKEN_KEY, result.token);
  localStorage.setItem('farmiqo-user', JSON.stringify(result.user));
  connectRealtime();
  return result;
}

export const register = (values) => authenticate('/auth/register', values);
export const login = (values) => authenticate('/auth/login', values);
export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('farmiqo-user');
  socket?.disconnect();
  socket = undefined;
};

export function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem('farmiqo-user') || 'null');
  } catch {
    return null;
  }
}

export const getListings = (params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null));
  return request(`/listings${query.size ? `?${query}` : ''}`);
};
export const getFarmerListings = () => getListings({ farmerId: getSavedUser()?.id });
export const createListing = (values) => request('/listings', { method: 'POST', body: JSON.stringify(values) });
export const updateListing = (id, values) => request(`/listings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(values) });
export const deleteListing = (id) => request(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getCart = () => request('/cart');
export const addCartItem = (listingId, quantity) => request('/cart/items', { method: 'POST', body: JSON.stringify({ listingId, quantity }) });
export const updateCartItem = (listingId, quantity) => request(`/cart/items/${encodeURIComponent(listingId)}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
export const removeCartItem = (listingId) => request(`/cart/items/${encodeURIComponent(listingId)}`, { method: 'DELETE' });
export const createOrder = (values) => request('/orders', { method: 'POST', body: JSON.stringify(values) });
export const getOrders = () => request('/orders');
export const getFarmerOrders = () => request('/farmer/orders');
export const updateOrderStatus = (id, status) => request(`/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const getNotifications = () => request('/notifications');

export function connectRealtime(onEvent = () => {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  if (!socket) {
    const base = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    socket = io(base, { auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity });
  }
  const events = ['listing:created', 'listing:updated', 'listing:stockUpdated', 'order:created', 'order:accepted', 'order:rejected', 'order:preparing', 'order:ready', 'order:dispatched', 'order:delivered', 'order:completed', 'notification:new'];
  for (const event of events) socket.off(event);
  for (const event of events) socket.on(event, (payload) => onEvent(event, payload));
  return socket;
}

export function isAuthenticated() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}
