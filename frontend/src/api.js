/**
 * api.js — All API calls live here. No fetch() anywhere else.
 */

const BASE = '';

function getToken() {
  return localStorage.getItem('admin_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  const resp = await fetch(`${BASE}${url}`, {
    ...options,
    headers: {
      ...options.headers,
      ...authHeaders(),
    },
  });

  if (resp.status === 401) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    if (window.location.pathname.startsWith('/admin')) {
      window.location.href = '/admin';
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${resp.status})`);
  }

  return resp.json();
}

async function requestWithBody(url, body, method = 'POST') {
  return request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function login(username, password) {
  const data = await requestWithBody('/api/auth/login', { username, password });
  localStorage.setItem('admin_token', data.token);
  localStorage.setItem('admin_username', data.username);
  return data;
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
  }
}

export async function changePassword(password) {
  return requestWithBody('/api/auth/change-password', { password });
}

// ─── Products ───────────────────────────────────────────────────────────────

export async function getProducts(options = {}) {
  const params = new URLSearchParams();
  if (options.category && options.category !== 'all') {
    params.append('category', options.category);
  }
  if (options.category_id) {
    params.append('category_id', options.category_id);
  }
  if (options.include_subcategories) {
    params.append('include_subcategories', 'true');
  }
  if (options.skin_concerns) {
    params.append('skin_concerns', options.skin_concerns);
  }
  if (options.search) {
    params.append('search', options.search);
  }
  const queryString = params.toString();
  return request(`/api/products${queryString ? `?${queryString}` : ''}`);
}

export async function getAllProducts() {
  return request('/api/products/all');
}

export async function searchProducts(query) {
  if (!query || query.length < 2) return [];
  return request(`/api/products/search?q=${encodeURIComponent(query)}`);
}

export async function getProductCategories() {
  // Legacy - gets distinct categories from products
  return request('/api/products/categories');
}

// ─── Categories (Hierarchical) ─────────────────────────────────────────────

export async function getCategories() {
  return request('/api/categories');
}

export async function getCategoriesTree() {
  return request('/api/categories/tree');
}

export async function createCategory(data) {
  return requestWithBody('/api/categories', data);
}

export async function updateCategory(id, data) {
  return requestWithBody(`/api/categories/${id}`, data, 'PUT');
}

export async function deleteCategory(id) {
  return request(`/api/categories/${id}`, { method: 'DELETE' });
}

export async function reorderCategories(ids) {
  return requestWithBody('/api/categories/reorder', { ids }, 'PATCH');
}

// ─── Skin Concerns ─────────────────────────────────────────────────────────

export async function getSkinConcerns() {
  return request('/api/skin-concerns');
}

export async function createSkinConcern(data) {
  return requestWithBody('/api/skin-concerns', data);
}

export async function updateSkinConcern(id, data) {
  return requestWithBody(`/api/skin-concerns/${id}`, data, 'PUT');
}

export async function deleteSkinConcern(id) {
  return request(`/api/skin-concerns/${id}`, { method: 'DELETE' });
}

export async function reorderSkinConcerns(ids) {
  return requestWithBody('/api/skin-concerns/reorder', { ids }, 'PATCH');
}

export async function updateProductSkinConcerns(productId, concernIds) {
  return requestWithBody(`/api/products/${productId}/skin-concerns`, { skin_concern_ids: concernIds }, 'PUT');
}

export async function getProduct(id) {
  return request(`/api/products/${id}`);
}

export async function createProduct(formData) {
  const resp = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (resp.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin';
    throw new Error('Session expired');
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to create product');
  }
  return resp.json();
}

export async function updateProduct(id, formData) {
  const resp = await fetch(`${BASE}/api/products/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: formData,
  });
  if (resp.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin';
    throw new Error('Session expired');
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to update product');
  }
  return resp.json();
}

export async function deleteProduct(id) {
  return request(`/api/products/${id}`, { method: 'DELETE' });
}

export async function reorderProducts(ids) {
  return requestWithBody('/api/products/reorder', { ids }, 'PATCH');
}

// ─── Pages ──────────────────────────────────────────────────────────────────

export async function getPages() {
  return request('/api/pages');
}

export async function getPage(slug) {
  return request(`/api/pages/${slug}`);
}

export async function createPage(slug, title) {
  return requestWithBody('/api/pages', { slug, title });
}

export async function updatePage(id, data) {
  return requestWithBody(`/api/pages/${id}`, data, 'PUT');
}

export async function deletePage(id) {
  return request(`/api/pages/${id}`, { method: 'DELETE' });
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getSettings() {
  return request('/api/settings');
}

export async function getAdminSettings() {
  return request('/api/settings/admin');
}

export async function updateSettings(settings) {
  return requestWithBody('/api/settings', settings, 'PUT');
}

// ─── Checkout & Orders ──────────────────────────────────────────────────────

export async function checkout(data) {
  return requestWithBody('/api/checkout', data);
}

export async function checkStock(items) {
  return requestWithBody('/api/stock/check', { items });
}

export async function getOrders() {
  return request('/api/orders');
}

export async function getOrderStats() {
  return request('/api/orders/stats');
}

export async function voidOrder(orderId) {
  return request(`/api/orders/${orderId}/void`, { method: 'POST' });
}

export async function deleteOrder(orderId) {
  return request(`/api/orders/${orderId}`, { method: 'DELETE' });
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || 'Upload failed');
  }
  return resp.json();
}

// ─── Health ─────────────────────────────────────────────────────────────────

export async function healthCheck() {
  return request('/api/health');
}

// ─── Backup & Restore ───────────────────────────────────────────────────────

export async function exportBackup() {
  return request('/api/backup/export');
}

export async function importBackup(file) {
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch(`${BASE}/api/backup/import`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (resp.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin';
    throw new Error('Session expired');
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || 'Restore failed');
  }
  return resp.json();
}
