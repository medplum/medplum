// Runs in <head> before the page renders, so it is a blocking script rather than part of main.mjs.
// It replaces what used to be inline scripts, so the site needs no 'unsafe-inline' in its script-src CSP.
import { gaId } from '@params';

// Apply the saved color theme before first paint, to avoid a flash of the wrong theme
const theme = localStorage.getItem('theme');
if (theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Queue Kapa API calls made before the async widget bundle loads
if (!window.Kapa) {
  const kapa = function () {
    kapa.c(arguments);
  };
  kapa.q = [];
  kapa.c = function (args) {
    kapa.q.push(args);
  };
  window.Kapa = kapa;
}

// Google Analytics, only in production builds (see layouts/partials/head-tags.html). Swup navigations are counted by
// GA's enhanced measurement ("page changes based on browser history events"), which is on for this property, so the
// site doesn't send its own page_view events; doing both counted every navigation twice.
if (gaId) {
  window.dataLayer = window.dataLayer || [];
  // gtag.js expects the arguments object itself, not an array
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', gaId);
}
