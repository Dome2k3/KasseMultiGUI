// runtime config for Helferplan - must be loaded BEFORE requests.js / plan.js
window.__API_URL_HELFERPLAN = 'https://meinraspi-tcp-helferplan.lgrw.de/api';
// optional expose for debugging
window.API_URL_HELFERPLAN = window.__API_URL_HELFERPLAN;
console.info('[config.js] __API_URL_HELFERPLAN =', window.__API_URL_HELFERPLAN);