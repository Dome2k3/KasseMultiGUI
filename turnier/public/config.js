// runtime config for Helferplan - must be loaded BEFORE requests.js / plan.js
window.__API_URL_TURNIER = 'https://meinraspi-tcp-turnier.lgrw.de/api';
// optional expose for debugging
window.API_URL_HELFERPLAN = window.__API_URL_TURNIER;
console.info('[config.js] __API_URL_TURNIER =', window.__API_URL_TURNIER);