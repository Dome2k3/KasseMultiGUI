// nav.js – Responsive burger menu toggle for all Helferplan pages
document.addEventListener('DOMContentLoaded', function () {
    var burger = document.getElementById('nav-burger');
    var navLinks = document.getElementById('nav-links');
    if (!burger || !navLinks) return;

    burger.addEventListener('click', function () {
        var isOpen = navLinks.classList.toggle('open');
        burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        burger.setAttribute('aria-label', isOpen ? 'Navigation schließen' : 'Navigation öffnen');
    });
});
