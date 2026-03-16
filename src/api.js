// ─── API CLIENT ─────────────────────────────────────────────────────
// Centralized fetch wrapper with JWT auth
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('auth_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

export function getStoredUser() {
  try {
    const u = localStorage.getItem('auth_user');
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem('auth_user', JSON.stringify(user));
  else localStorage.removeItem('auth_user');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid — clear auth
    setToken(null);
    setStoredUser(null);
    window.dispatchEvent(new Event('auth-expired'));
  }

  return res;
}

// ─── AUTH ────────────────────────────────────────────────────────────
export async function login(email, password) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function getMe() {
  const res = await apiFetch('/auth/me');
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}

export async function registerUser(name, email, password, role) {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data.user;
}

export function logout() {
  setToken(null);
  setStoredUser(null);
}

// ─── INSIGHTS ───────────────────────────────────────────────────────
export async function fetchInsights(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'All') params.set(k, v); });
  const res = await apiFetch(`/insights?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch insights');
  return data.insights;
}

export async function submitInsight(insight) {
  const res = await apiFetch('/insights', {
    method: 'POST',
    body: JSON.stringify(insight),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit insight');
  // Return full response so caller can check data.autoReviewed
  return data;
}

export async function autoReviewInsight(id) {
  const res = await apiFetch(`/insights/${id}/auto-review`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Auto-review failed');
  return data.insight;
}

export async function deleteInsight(id) {
  const res = await apiFetch(`/insights/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete insight');
  return data;
}

export async function updateInsight(id, updates) {
  const res = await apiFetch(`/insights/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update insight');
  return data.insight;
}

// ─── REPORTS ────────────────────────────────────────────────────────
export async function generateReport() {
  const res = await apiFetch('/reports/generate', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate report');
  return data.report;
}

export async function fetchReports() {
  const res = await apiFetch('/reports');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch reports');
  return data.reports;
}

// ─── ADMIN ──────────────────────────────────────────────────────────
export async function fetchUsers() {
  const res = await apiFetch('/admin/users');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
  return data.users;
}

export async function fetchAdminStats() {
  const res = await apiFetch('/admin/stats');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch stats');
  return data.stats;
}

export async function fetchAdminActivity() {
  const res = await apiFetch('/admin/activity');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch activity');
  return data.activity;
}

export async function updateUserRole(id, role) {
  const res = await apiFetch(`/admin/users/${id}/role`, {
    method: 'PATCH', body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update role');
  return data.user;
}

export async function updateUserActive(id, active) {
  const res = await apiFetch(`/admin/users/${id}/active`, {
    method: 'PATCH', body: JSON.stringify({ active }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update user');
  return data.user;
}

export async function deleteUser(id) {
  const res = await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete user');
  return data;
}

export async function bulkPublishInsights(ids) {
  const res = await apiFetch('/admin/insights/bulk-publish', {
    method: 'POST', body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to publish insights');
  return data;
}

export async function bulkUploadInsights(entries) {
  const res = await apiFetch('/admin/insights/bulk-upload', {
    method: 'POST', body: JSON.stringify({ entries }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to upload insights');
  return data;
}

// ─── PANEL SIGNALS ──────────────────────────────────────────────────
export async function fetchSignals(panel) {
  const res = await apiFetch(`/signals?panel=${panel}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch signals');
  return data.signals;
}

export async function addSignal(title, url, panel) {
  const res = await apiFetch('/signals', {
    method: 'POST',
    body: JSON.stringify({ title, url, panel }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add signal');
  return data.signal;
}

export async function deleteSignal(id) {
  const res = await apiFetch(`/signals/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete signal');
  return data;
}

export async function bulkAddSignals(items, panel) {
  const res = await apiFetch('/signals/bulk', {
    method: 'POST',
    body: JSON.stringify({ items, panel }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to bulk add signals');
  return data.signals;
}

export async function bulkDeleteSignals(ids) {
  const res = await apiFetch('/signals', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete signals');
  return data;
}

export async function bulkDeleteInsights(ids) {
  const res = await apiFetch('/insights', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete insights');
  return data;
}

// ─── AI ─────────────────────────────────────────────────────────────
export async function summarizeInsight(payload) {
  const res = await apiFetch('/ai/summarize', { method: 'POST', body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Summarization failed');
  return data.result;
}

// ─── AI USAGE ───────────────────────────────────────────────────────
export async function logAiUsage(type, tokens) {
  try {
    await apiFetch('/ai-usage/log', { method: 'POST', body: JSON.stringify({ type, tokens }) });
  } catch (_) {}
}

export async function fetchAiUsageStats() {
  const res = await apiFetch('/ai-usage/stats');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch AI usage stats');
  return data.stats;
}

// ─── PROFILE ────────────────────────────────────────────────────────
export async function fetchProfile() {
  const res = await apiFetch('/profile');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch profile');
  return data.profile;
}

// ─── EXPORT ─────────────────────────────────────────────────────────
export async function exportAllData() {
  const res = await apiFetch('/admin/export');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to export data');
  return data;
}

// ─── IMPORT ─────────────────────────────────────────────────────────
export async function importAllData(payload) {
  const res = await apiFetch('/admin/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to import data');
  return data;
}
