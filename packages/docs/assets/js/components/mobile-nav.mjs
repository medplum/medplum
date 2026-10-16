// Mobile navbar drawer (below 997px; markup in layouts/partials/navbar.html).
// On docs pages the drawer opens to the docs sidebar, as in Docusaurus. Rather than render the
// sidebar twice, the existing sidebar is moved from <aside> into the drawer while it's open.
// Uses document-level event delegation, so it needs no re-initialization after Swup page transitions.

const DESKTOP = window.matchMedia('(min-width: 997px)');

function sidebar() {
  return document.querySelector('.sidebar-viewport');
}

export function openMobileNav() {
  const body = document.body;
  body.classList.add('mobile-nav-open');
  document.querySelector('.navbar-toggle')?.setAttribute('aria-expanded', 'true');

  const docsSidebar = sidebar();
  if (body.dataset.sidebar === 'open' && docsSidebar) {
    body.classList.add('mobile-nav-show-secondary');
    document.querySelector('.mobile-nav-docs')?.appendChild(docsSidebar);
  }
}

export function closeMobileNav() {
  const body = document.body;
  if (!body.classList.contains('mobile-nav-open')) {
    return;
  }
  body.classList.remove('mobile-nav-open', 'mobile-nav-show-secondary');
  document.querySelector('.navbar-toggle')?.setAttribute('aria-expanded', 'false');

  // Put the docs sidebar back in the page layout
  const docsSidebar = sidebar();
  if (docsSidebar && !docsSidebar.closest('aside')) {
    document.querySelector('aside')?.appendChild(docsSidebar);
  }
}

export function initMobileNav() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.navbar-toggle')) {
      openMobileNav();
    } else if (e.target.closest('.mobile-nav-close, .mobile-nav-backdrop')) {
      closeMobileNav();
    } else if (e.target.closest('.mobile-nav-back')) {
      document.body.classList.remove('mobile-nav-show-secondary');
    } else if (e.target.closest('.mobile-nav-panel a[href]')) {
      // Following a link (Swup navigates in place, so the drawer must close itself)
      closeMobileNav();
    } else if (e.target.closest('.toc-mobile a')) {
      e.target.closest('details').open = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileNav();
    }
  });

  DESKTOP.addEventListener('change', (e) => {
    if (e.matches) {
      closeMobileNav();
    }
  });
}
