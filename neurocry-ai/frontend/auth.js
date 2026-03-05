// ═══════════════════════════════════════════════════════════
//  auth.js  —  NeuroCry AI  |  JWT Session Management
// ═══════════════════════════════════════════════════════════

const API = "http://127.0.0.1:8001";

// ── Storage helpers ───────────────────────────────────────────────────────────
function getToken()  { return localStorage.getItem("nc_token"); }
function getUser()   { try { return JSON.parse(localStorage.getItem("nc_user") || "{}"); } catch { return {}; } }

function setSession(token, user) {
    localStorage.setItem("nc_token", token);
    localStorage.setItem("nc_user", JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem("nc_token");
    localStorage.removeItem("nc_user");
    localStorage.removeItem("nc_child_id");
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// ── Redirect already-logged-in users away from login/register ─────────────────
function redirectIfLoggedIn() {
    if (getToken()) {
        window.location.href = "dashboard.html";
    }
}

// ── Fetch wrapper (attaches Bearer token) ────────────────────────────────────
async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    if (res.status === 401) {
        clearSession();
        window.location.href = "login.html";
        return null;
    }
    return res;
}

async function apiJSON(path, options = {}) {
    const res = await apiFetch(path, options);
    if (!res) return null;
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Request failed"); }
    return res.json();
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
    clearSession();
    window.location.href = "index.html";
}

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(msg, type = "success") {
    const colors = { success: "#10b981", error: "#ef4444", info: "#3b82f6", warning: "#f59e0b" };
    const icons  = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    const t = document.createElement("div");
    t.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        display:flex;align-items:center;gap:10px;
        padding:12px 20px;border-radius:12px;
        background:${colors[type]};color:#fff;
        font-size:14px;font-weight:600;
        box-shadow:0 8px 30px rgba(0,0,0,0.2);
        transform:translateY(20px);opacity:0;
        transition:all 0.3s ease;font-family:Inter,sans-serif;`;
    t.innerHTML = `<span style="font-size:16px">${icons[type]}</span><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = "translateY(0)"; t.style.opacity = "1"; });
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(20px)"; setTimeout(() => t.remove(), 300); }, 3500);
}

// ── Spinner helper ────────────────────────────────────────────────────────────
function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn._origHTML = btn.innerHTML;
        btn.innerHTML = `<span style="display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;"></span>`;
        if (!document.getElementById("nc-spin-style")) {
            const s = document.createElement("style");
            s.id = "nc-spin-style";
            s.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
            document.head.appendChild(s);
        }
    } else {
        btn.disabled = false;
        if (btn._origHTML) btn.innerHTML = btn._origHTML;
    }
}

// ── Dynamic nav injection ────────────────────────────────────────────────────
function initNav() {
    const el = document.getElementById("navUserEmail");
    const user = getUser();
    if (el && user.email) el.textContent = user.name || user.email;
    document.querySelectorAll(".logoutBtn").forEach(b => b.addEventListener("click", logout));

    // Inject dashboard nav user badge if element exists
    const navBadge = document.getElementById("navUserBadge");
    if (navBadge && user.email) {
        navBadge.textContent = (user.name || user.email)[0].toUpperCase();
    }
}
