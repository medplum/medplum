import SwupPreloadPlugin from '@swup/preload-plugin';
import Swup from 'swup';
import { destroyAnimatedCircles, initAnimatedCircles } from './components/animated-circle.mjs';
import { initBuildDropdowns } from './components/build-dropdown.mjs';
import { destroyCountUps, initCountUps } from './components/count-up.mjs';
import { closeMobileNav, initMobileNav } from './components/mobile-nav.mjs';
import { destroyProducts, initProducts } from './components/products/index.mjs';
import { destroySolutions, initSolutions } from './components/solutions/index.mjs';
import { initKapa } from './components/kapa.mjs';
import { initMermaid } from './components/mermaid.mjs';
import { initSearch, openSearchFromPage } from './components/search.mjs';
import { initTabs } from './components/tabs.mjs';
import { initCopyCode } from './components/copy-code.mjs';
import { destroyToc, initToc } from './components/toc.mjs';

function setAttribute(key, value) {
  document.body.dataset[key] = value;
}

// Full-width marketing pages, keyed by path (see data-page in layouts/_default/baseof.html)
const landingPages = {
  '/': 'home',
  '/products': 'products',
  '/solutions': 'solutions',
};

// Deployed URLs have no trailing slash; the Hugo dev server's do
function normalizePath(url) {
  const pathname = new URL(url, window.location.origin).pathname;
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

function inSection(pathname, section) {
  return pathname === section || pathname.startsWith(section + '/');
}

function isCurrentPage(href) {
  return normalizePath(href) === normalizePath(window.location.href);
}

function updateAttributes(newUrl) {
  const pathname = normalizePath(newUrl);
  const onDocsPage = inSection(pathname, '/docs');
  setAttribute('breadcrumbs', onDocsPage ? 'visible' : 'hidden');
  setAttribute('sidebar', onDocsPage ? 'open' : 'closed');
  setAttribute('docFooter', onDocsPage ? 'visible' : 'hidden');

  // Markdown pages outside the docs and blog show theirs through .main-container-page (see main.css)
  const showToc = onDocsPage || pathname.startsWith('/blog/');
  setAttribute('toc', showToc ? 'visible' : 'hidden');

  const page = landingPages[pathname];
  if (page) {
    setAttribute('page', page);
  } else {
    delete document.body.dataset.page;
  }
}

// The home page navbar is transparent until the page is scrolled (see pages/home.scss)
function updateNavbarScroll() {
  document.querySelector('.navbar')?.classList.toggle('on-scroll', window.scrollY > 0);
}

window.addEventListener('scroll', updateNavbarScroll, { passive: true });

// Swup replaces only the page content and <title>, so copy the incoming page's own head tags (description, canonical
// URL, Open Graph; marked data-page-meta in layouts/partials/head-meta.html) for anything that reads them client-side
function updatePageMeta(doc) {
  if (!doc) {
    return;
  }
  document.head.querySelectorAll('[data-page-meta]').forEach((el) => el.remove());
  document.head.append(...Array.from(doc.head.querySelectorAll('[data-page-meta]'), (el) => document.importNode(el, true)));
}

// Navbar links are active on their own path and everything under it (see layouts/partials/navbar.html)
function updateActiveNavbarLinks(url) {
  const pathname = new URL(url, window.location.origin).pathname;
  document.querySelectorAll('[data-active-base]').forEach((link) => {
    const active = pathname.startsWith(link.dataset.activeBase);
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function updateActiveLinks() {
  document.querySelectorAll('.sidebar-category-header-wrapper.active').forEach((el) => {
    el.classList.remove('active');
  });

  document.querySelectorAll('.sidebar-link.active').forEach((el) => {
    el.classList.remove('active');
  });

  document.querySelectorAll('.sidebar-link[href]').forEach((link) => {
    if (isCurrentPage(link.href)) {
      link.closest('.sidebar-category-header-wrapper')?.classList.add('active');
      link.classList.add('active');
      // Open every category containing the page; the sidebar is outside #swup, so its server-rendered state goes stale
      for (let c = link.closest('.sidebar-category'); c; c = c.parentElement.closest('.sidebar-category')) {
        c.classList.add('expanded');
      }
    }
  });
}

document.body.addEventListener('click', (e) => {
  const target = e.target;

  // The whole caret wrapper is the click target (it has the hover highlight), not just the 24px caret inside it
  if (target.closest('.sidebar-caret-wrapper')) {
    const category = target.closest('.sidebar-category');
    if (category) {
      category.classList.toggle('expanded');
    }
  }

  // As in Docusaurus, a category label without a page (a <span>, so no href) toggles like the caret; one with a page
  // expands on the way there, and toggles once you're on it
  if (target.matches('.sidebar-category-link')) {
    const category = target.closest('.sidebar-category');
    if (category) {
      if (!target.href || isCurrentPage(target.href)) {
        category.classList.toggle('expanded');
      } else {
        category.classList.add('expanded');
      }
    }
  }
});

// Delegated: the navbar and the mobile drawer each have a theme toggle
document.addEventListener('click', (e) => {
  if (!e.target.closest('.theme-toggle')) {
    return;
  }
  e.preventDefault();
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

export const swup = new Swup({
  containers: ['#swup'],
  animationSelector: false,
  animateHistoryBrowsing: false,
  // Compare URLs without a trailing slash: hugo server serves /docs/api/ while links say /docs/api, which would make a
  // link to the current page a new visit instead of a scroll (production URLs have no trailing slash)
  resolveUrl: (url) => url.replace(/(.)\/(?=[?#]|$)/, '$1'),
  // Fetch a page when its link is hovered or touched, so the click renders from swup's cache (as Docusaurus does)
  plugins: [new SwupPreloadPlugin()],
});

swup.hooks.on('visit:start', closeMobileNav);

swup.hooks.before('content:replace', (visit) => {
  updateAttributes(visit.to.url);
  updateActiveNavbarLinks(visit.to.url);
  updatePageMeta(visit.to.document);
  destroyAnimatedCircles();
  destroyCountUps();
  destroyProducts();
  destroySolutions();
  destroyToc();
});

swup.hooks.on('content:replace', (visit) => {
  initAnimatedCircles();
  initCountUps();
  initProducts();
  initSolutions();
  updateNavbarScroll();
  initTabs();
  initCopyCode();
  initMermaid();
  initToc();
  updateActiveLinks();
  openSearchFromPage();
});

updateAttributes(window.location.href);
updateNavbarScroll();
initBuildDropdowns();
initMobileNav();
initAnimatedCircles();
initCountUps();
initProducts();
initSolutions();
initTabs();
initCopyCode();
initMermaid();
initToc();
initKapa(swup);
initSearch(swup);
