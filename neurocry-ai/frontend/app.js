/**
 * NeuroCry AI — app.js
 * Shared frontend utilities: auth session, API calls, navigation, toasts
 */

const API = 'http://127.0.0.1:3001';

// ── Session Management ───────────────────────────────────────
function getToken()  { return localStorage.getItem('nc_token'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('nc_user') || '{}'); } catch { return {}; } }
function setSession(token, user) {
  localStorage.setItem('nc_token', token);
  localStorage.setItem('nc_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('nc_token');
  localStorage.removeItem('nc_user');
}

// ── Auth Guards ─────────────────────────────────────────────
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}
function redirectIfLoggedIn() {
  if (getToken()) { window.location.href = 'dashboard.html'; }
}

function logout() {
  clearSession();
  showToast('Logged out successfully', 'info');
  setTimeout(() => { window.location.href = 'index.html'; }, 600);
}

// ── Authenticated API Fetch ──────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body instanceof FormData) delete headers['Content-Type'];

  const res = await fetch(API + endpoint, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Session expired');
  }
  return res;
}

async function apiJSON(endpoint, options = {}) {
  try {
    const res  = await apiFetch(endpoint, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.detail || 'Request failed');
    return data;
  } catch (err) {
    if (err.message !== 'Session expired') throw err;
  }
}

// ── Toast Notifications ─────────────────────────────────────
(function initToasts() {
  if (!document.getElementById('toastContainer')) {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
})();

function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} toast-icon"></i><span>${message}</span>`;
  document.getElementById('toastContainer').appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ── Loading State on Buttons ─────────────────────────────────
function setLoading(btn, loading, originalText) {
  if (loading) {
    btn._savedText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${originalText || 'Processing...'}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._savedText || originalText || 'Submit';
  }
}

// ── Sidebar Injection ────────────────────────────────────────
function initSidebar(activePage) {
  const user = getUser();
  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const links = [
    { href: 'dashboard.html',   icon: 'fa-chart-pie',      label: 'Dashboard',           key: 'dashboard' },
    { href: 'patients.html',    icon: 'fa-users',          label: 'Patient Portal',       key: 'patients' },
    { href: 'add-patient.html', icon: 'fa-user-plus',      label: 'Register Patient',     key: 'add-patient' },
    { href: 'monitor.html',     icon: 'fa-wave-square',    label: 'Live Monitoring',      key: 'monitor' }
  ];

  const navHTML = links.map(l => `
    <a href="${l.href}" class="sidebar-link ${activePage === l.key ? 'active' : ''}">
      <i class="fas ${l.icon}"></i> ${l.label}
    </a>`).join('');

  const sidebar = document.getElementById('appSidebar');
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon"><i class="fas fa-stethoscope"></i></div>
      <div class="sidebar-logo-text">NeuroCry <span>AI</span></div>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section-label">Navigation</div>
      ${navHTML}
    </nav>
    <div class="sidebar-footer">
      <div class="user-chip">
        <div class="user-avatar">${initials}</div>
        <div style="overflow:hidden">
          <div class="user-info-name truncate">${user.name || 'User'}</div>
          <div class="user-info-email truncate">${user.email || ''}</div>
        </div>
      </div>
      <button onclick="logout()" class="btn btn-ghost btn-sm btn-block" style="justify-content:flex-start">
        <i class="fas fa-sign-out-alt"></i> Sign Out
      </button>
    </div>
  `;

  // Mobile toggle
  const toggleBtn = document.getElementById('sidebarToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) sidebar.classList.remove('open');
    });
  }
}

// ── Public Nav Injection ─────────────────────────────────────
function initPublicNav(activePage) {
  const token = getToken();
  const nav   = document.getElementById('pubNavLinks');
  const cta   = document.getElementById('pubNavCta');

  if (nav) {
    nav.innerHTML = `
      <a href="index.html"  class="${activePage === 'home'  ? 'active' : ''}">Home</a>
      <a href="about.html"  class="${activePage === 'about' ? 'active' : ''}">About</a>
      <a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>
    `;
  }
  if (cta) {
    cta.innerHTML = token
      ? `<button onclick="logout()" class="btn btn-outline btn-sm">Sign Out</button>
         <a href="dashboard.html" class="btn btn-primary btn-sm">Dashboard</a>`
      : `<a href="login.html"    class="btn btn-outline btn-sm">Login</a>
         <a href="register.html" class="btn btn-primary btn-sm">Register Free</a>`;
  }
}

// ── Misc Helpers ─────────────────────────────────────────────
function riskBadge(level) {
  const map = { Low: 'badge-low', Medium: 'badge-medium', High: 'badge-high' };
  const icon = { Low: 'fa-check-circle', Medium: 'fa-exclamation-triangle', High: 'fa-times-circle' };
  const cls = map[level] || 'badge-muted';
  return `<span class="badge ${cls}"><i class="fas ${icon[level] || 'fa-circle'}"></i> ${level || '—'}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
