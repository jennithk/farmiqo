import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';

const configuredApiRoot = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
const isNativeApp = Capacitor.isNativePlatform();
const API_ROOT = isNativeApp
  ? (configuredApiRoot?.startsWith('https://') ? configuredApiRoot : '')
  : configuredApiRoot || '/api';
const TOKEN_KEY = 'farmiqo-session-token';
let socket;
let socketToken;

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function request(path, options = {}) {
  if (!API_ROOT) {
    throw new ApiError('This native build has no API URL configured. Rebuild it with VITE_API_URL set.', 0, 'API_URL_NOT_CONFIGURED');
  }
  const token = localStorage.getItem(TOKEN_KEY);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
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
export const getCurrentUser = () => request('/auth/me');
export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('farmiqo-user');
  socket?.disconnect();
  socket = undefined;
  socketToken = undefined;
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
export const getFarmerListings = () => request('/farmer/listings');
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
export const getFeeConfig = () => request('/config');
export const getAddresses = () => request('/addresses');
export const createAddress = (values) => request('/addresses', { method: 'POST', body: JSON.stringify(values) });
export const updateAddress = (id, values) => request(`/addresses/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(values) });
export const deleteAddress = (id) => request(`/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const requestPasswordReset = (email) => request('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
export const confirmPasswordReset = (token, password) => request('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
export const deleteAccount = (password) => request('/users/me', { method: 'DELETE', body: JSON.stringify({ password }) });
export const updateProfile = (values) => request('/users/me', { method: 'PUT', body: JSON.stringify(values) });
export const getBulkGroups = (params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null));
  return request(`/bulk/groups${query.size ? `?${query}` : ''}`);
};
export const getBulkGroup = (id) => request(`/bulk/groups/${encodeURIComponent(id)}`);
export const createBulkGroup = (values) => request('/bulk/groups', { method: 'POST', body: JSON.stringify(values) });
export const joinBulkGroup = (id, quantity, address, pincode, addressId) => request(`/bulk/groups/${encodeURIComponent(id)}/join`, { method: 'POST', body: JSON.stringify({ quantity, ...(address !== undefined ? { address } : {}), ...(pincode !== undefined ? { pincode } : {}), ...(addressId ? { addressId } : {}) }) });
export const getFarmerBulkGroups = () => request('/farmer/bulk/groups');
export const assignBulkGroup = (id) => request(`/bulk/groups/${encodeURIComponent(id)}/assign`, { method: 'POST' });
export const unassignBulkGroup = (id) => request(`/bulk/groups/${encodeURIComponent(id)}/unassign`, { method: 'POST' });
export const leaveBulkGroup = (id) => request(`/bulk/groups/${encodeURIComponent(id)}/leave`, { method: 'POST' });
export const cancelBulkGroup = (id) => request(`/bulk/groups/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
export const fulfilBulkGroup = (id) => request(`/bulk/groups/${encodeURIComponent(id)}/fulfil`, { method: 'POST' });
export const getForecast = () => request('/farmer/forecast');
export const getUploadConfig = () => request('/uploads/config');
export const getUploadSignature = () => request('/uploads/signature', { method: 'POST' });

export function connectRealtime(onEvent = () => {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = undefined;
  }
  if (!socket) {
    const base = new URL(API_ROOT, window.location.origin).origin;
    socket = io(base, { auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity });
    socketToken = token;
  }
  const events = ['listing:created', 'listing:updated', 'listing:stockUpdated', 'order:created', 'order:accepted', 'order:rejected', 'order:cancelled', 'order:preparing', 'order:ready', 'order:dispatched', 'order:delivered', 'order:completed', 'notification:new', 'bulk:updated'];
  for (const event of events) socket.off(event);
  for (const event of events) socket.on(event, (payload) => onEvent(event, payload));
  return socket;
}

export function isAuthenticated() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}
