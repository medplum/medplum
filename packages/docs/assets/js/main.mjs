import mermaid from 'mermaid';
import Swup from 'swup';
import { destroyAnimatedCircles, initAnimatedCircles } from './components/animated-circle.mjs';
import { initBuildDropdowns } from './components/build-dropdown.mjs';
import { destroyCountUps, initCountUps } from './components/count-up.mjs';
import { closeMobileNav, initMobileNav } from './components/mobile-nav.mjs';
import { destroyProducts, initProducts } from './components/products/index.mjs';
import { destroySolutions, initSolutions } from './components/solutions/index.mjs';
import { initTabs } from './components/tabs.mjs';
import { destroyToc, initToc } from './components/toc.mjs';

mermaid.initialize({ startOnLoad: true });

function setAttribute(key, value) {
  document.body.dataset[key] = value;
}

// Full-width marketing pages, keyed by path (see data-page in layouts/_default/baseof.html)
const landingPages = {
  '/': 'home',
  '/products/': 'products',
  '/products': 'products',
  '/solutions/': 'solutions',
  '/solutions': 'solutions',
};

function updateAttributes(newUrl) {
  const onDocsPage = newUrl.includes('/docs/');
  setAttribute('breadcrumbs', onDocsPage ? 'visible' : 'hidden');
  setAttribute('sidebar', onDocsPage ? 'open' : 'closed');
  setAttribute('docFooter', onDocsPage ? 'visible' : 'hidden');

  const showToc = onDocsPage || newUrl.includes('/blog/') || newUrl.includes('/careers/') || newUrl.includes('/terms');
  setAttribute('toc', showToc ? 'visible' : 'hidden');

  const page = landingPages[new URL(newUrl, window.location.origin).pathname];
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
    if (link.href === window.location.href) {
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

  if (target.matches('.sidebar-caret')) {
    const category = target.closest('.sidebar-category');
    if (category) {
      category.classList.toggle('expanded');
    }
  }

  if (target.matches('.sidebar-category-link')) {
    const category = target.closest('.sidebar-category');
    if (category) {
      if (target.href === window.location.href) {
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
});

swup.hooks.on('visit:start', closeMobileNav);

swup.hooks.before('content:replace', (visit) => {
  updateAttributes(visit.to.url);
  updateActiveNavbarLinks(visit.to.url);
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
  initToc();
  updateActiveLinks();
  mermaid.run().catch(console.error);
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
initToc();
