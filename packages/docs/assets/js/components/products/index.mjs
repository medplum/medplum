// Behavior for the products page (layouts/products/list.html). Each widget returns an optional
// cleanup function for the window-level listeners and timers it owns; listeners on page elements
// go away with the markup when Swup replaces the page.

import { initApps } from './apps.mjs';
import { initCtaSlideshow } from './cta-slideshow.mjs';
import { initDiagram } from './diagram.mjs';
import { initFoundations } from './foundations.mjs';
import { initMessagingPreview } from './messaging-preview.mjs';

let cleanups = [];

export function initProducts() {
  // The .landing wrapper from layouts/products/list.html holds the page plus the data appended by port-landing.mjs
  const root = document.querySelector('.products-page-page')?.closest('.landing');
  if (!root) {
    return;
  }
  cleanups = [initApps, initMessagingPreview, initFoundations, initDiagram, initCtaSlideshow].map((init) => init(root)).filter(Boolean);
}

export function destroyProducts() {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
}
