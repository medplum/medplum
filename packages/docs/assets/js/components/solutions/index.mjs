// Behavior for the solutions page (layouts/solutions/list.html). Each widget returns an optional
// cleanup function for the observers and window-level listeners it owns.

import { initCategoryNav } from './category-nav.mjs';
import { initCustomerVideos } from './customer-videos.mjs';
import { initHeroAnimation } from './hero-animation.mjs';

let cleanups = [];

export function initSolutions() {
  // The .landing wrapper from layouts/solutions/list.html holds the page plus the data appended by port-landing.mjs
  const root = document.querySelector('.solutions-page-page')?.closest('.landing');
  if (!root) {
    return;
  }
  cleanups = [initHeroAnimation, initCategoryNav, initCustomerVideos].map((init) => init(root)).filter(Boolean);
}

export function destroySolutions() {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
}
