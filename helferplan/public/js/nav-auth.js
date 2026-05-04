// nav-auth.js - Shared nav link visibility based on authentication status
// Hides "Turnier-Admin" link for non-admins and "Helfer-Adden" link for non-logged-in users.
(async function () {
    const API_URL = (() => {
        const meta = document.querySelector('meta[name="api-url-helferplan"]');
        if (meta && meta.content) return meta.content.replace(/\/$/, '');
        if (window.__API_URL_HELFERPLAN) return String(window.__API_URL_HELFERPLAN).replace(/\/$/, '');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `${window.location.protocol}//${window.location.hostname}:3003/api`;
        }
        return `${window.location.origin}/api`;
    })();

    // Token helpers for localStorage fallback (for browsers that block cookies, e.g. Chrome iOS)
    function getStoredToken() {
        try { return localStorage.getItem('hp_session_token'); } catch(e) { return null; }
    }
    function getAuthHeaders() {
        const token = getStoredToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    try {
        const res = await fetch(`${API_URL}/current-user`, {
            credentials: 'include',
            headers: { ...getAuthHeaders() }
        });
        if (res.ok) {
            const data = await res.json();
            const isLoggedIn = data.authenticated && data.user;
            const isAdmin = isLoggedIn && data.user.is_admin;

            const navTurniAdmin = document.getElementById('nav-turnier-admin');
            if (navTurniAdmin) {
                navTurniAdmin.style.display = isAdmin ? '' : 'none';
            }

            const navHelferAdd = document.getElementById('nav-helper-add');
            if (navHelferAdd) {
                navHelferAdd.style.display = isLoggedIn ? '' : 'none';
            }
        }
    } catch (e) {
        // On error keep links hidden (they default to display:none in the HTML)
    }
})();
