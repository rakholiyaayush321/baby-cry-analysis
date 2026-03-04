// ═══════════════════════════════════════════════════════════
//  auth.js  —  Central Authentication & API Utility
// ═══════════════════════════════════════════════════════════

const API = "http://127.0.0.1:8001";

// ── Token helpers ────────────────────────────────────────────
function getToken() { return localStorage.getItem("nc_token"); }
function getUser()  { try { return JSON.parse(localStorage.getItem("nc_user") || "{}"); } catch { return {}; } }
function setSession(token, user) {
    localStorage.setItem("nc_token", token);
    localStorage.setItem("nc_user", JSON.stringify(user));
}
function clearSession() {
    localStorage.removeItem("nc_token");
    localStorage.removeItem("nc_user");
    localStorage.removeItem("nc_child_id");
}

// ── Guard: always authenticated ────────────
function requireAuth() {
    return true; 
}

// ── Auto-logout on 401 ───────────────────────────────────────
async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    // Disable auto-logout on 401 as we are in guest mode
    return res;
}

async function apiJSON(path, options = {}) {
    const res = await apiFetch(path, options);
    if (!res) return null;
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Request failed"); }
    return res.json();
}

// ── Toast notifications ──────────────────────────────────────
function showToast(msg, type = "success") {
    const colors = { success: "bg-emerald-500", error: "bg-red-500", info: "bg-blue-500", warning: "bg-amber-500" };
    const icon   = { success: "bi-check-circle-fill", error: "bi-x-circle-fill", info: "bi-info-circle-fill", warning: "bi-exclamation-triangle-fill" };
    const t = document.createElement("div");
    t.className = `fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl text-white shadow-xl text-sm font-medium
                   transform translate-y-8 opacity-0 transition-all duration-300 ${colors[type]}`;
    t.innerHTML = `<i class="bi ${icon[type]} text-lg"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = "translateY(0)"; t.style.opacity = "1"; });
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; setTimeout(() => t.remove(), 300); }, 3500);
}

// ── Spinner ──────────────────────────────────────────────────
function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn._origHTML = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>`;
    } else {
        btn.disabled = false;
        if (btn._origHTML) btn.innerHTML = btn._origHTML;
    }
}

// ── Logout ───────────────────────────────────────────────────
function logout() { 
    clearSession(); 
    window.location.reload(); 
}

// ── Populate nav user info ────────────────────────────────────
function initNav() {
    const user = { email: "guest@neurocry.ai" };
    const el = document.getElementById("navUserEmail");
    if (el) el.textContent = user.email;
    document.querySelectorAll(".logoutBtn").forEach(b => b.addEventListener("click", logout));
}
