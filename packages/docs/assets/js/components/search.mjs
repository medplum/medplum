// Algolia DocSearch, configured as Docusaurus's theme-search-algolia was, with the same index.
// The DocSearch bundle (assets/js/docsearch.mjs) loads on first use: the navbar search button, Ctrl/Cmd+K, or /.
// The /search page opens the modal with its ?q= query.

// Public search-only key (safe to commit), as in the Docusaurus config
const ALGOLIA_APP_ID = '6A1DXS603N';
const ALGOLIA_API_KEY = '06bafd15f5a637275ed20297927355f9';
const ALGOLIA_INDEX = 'medplum';

// Docusaurus's contextualSearch: English, and either docs pages or the rest of the site (see docsearch-meta.html)
const FACET_FILTERS = ['language:en', ['docusaurus_tag:default', 'docusaurus_tag:docs-default-current']];

// Hits link to the production site; keep them on the current origin (previews, swup navigation)
const SITE_HOSTNAME = 'www.medplum.com';

let swup;
let instance;
let instanceQuery;
let docsearchPromise;

function loadDocSearch() {
  docsearchPromise ??= import(document.querySelector('meta[name="docsearch-bundle"]').content).then((m) => m.default);
  return docsearchPromise;
}

function toLocalUrl(url) {
  const parsed = new URL(url, window.location.origin);
  return parsed.hostname === SITE_HOSTNAME ? parsed.pathname + parsed.search + parsed.hash : url;
}

/**
 * Opens the search modal, optionally with a query.
 * @param {string} [query] - The initial query.
 */
async function openSearch(query = '') {
  const docsearch = await loadDocSearch();
  // DocSearch takes the initial query at creation, so a new query needs a new instance
  if (!instance || query !== instanceQuery) {
    instance?.destroy();
    instanceQuery = query;
    instance = docsearch({
      container: getContainer(),
      appId: ALGOLIA_APP_ID,
      apiKey: ALGOLIA_API_KEY,
      indices: [{ name: ALGOLIA_INDEX, searchParameters: { facetFilters: FACET_FILTERS } }],
      initialQuery: query,
      // Handled below, so the shortcuts work before the bundle has loaded
      keyboardShortcuts: { 'Ctrl/Cmd+K': false, '/': false },
      transformItems: (items) => items.map((item) => ({ ...item, url: toLocalUrl(item.url) })),
      navigator: {
        navigate: ({ itemUrl }) => swup.navigate(itemUrl),
        navigateNewTab: ({ itemUrl }) => window.open(itemUrl, '_blank', 'noopener'),
        navigateNewWindow: ({ itemUrl }) => window.open(itemUrl, '_blank', 'noopener'),
      },
    });
  }
  instance.open();
}

// DocSearch renders its own search button into the container; the navbar keeps ours, so hide it
function getContainer() {
  let container = document.getElementById('docsearch-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'docsearch-container';
    container.hidden = true;
    document.body.append(container);
  }
  return container;
}

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** On the /search page, open the modal with the page's ?q= query. */
export function openSearchFromPage() {
  if (window.location.pathname.replace(/\/$/, '') === '/search') {
    openSearch(new URLSearchParams(window.location.search).get('q') ?? '').catch(console.error);
  }
}

/**
 * Wires up the search button and keyboard shortcuts.
 * @param {{ navigate: (url: string) => void, hooks: { on: (name: string, fn: () => void) => void } }} swupInstance - The swup instance.
 */
export function initSearch(swupInstance) {
  swup = swupInstance;

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element && event.target.closest('[data-search-trigger]');
    if (trigger && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      openSearch().catch(console.error);
    }
  });

  // Start loading DocSearch when the pointer or focus reaches the search button, as Docusaurus does
  for (const type of ['pointerover', 'focusin']) {
    document.addEventListener(type, (event) => {
      if (event.target instanceof Element && event.target.closest('[data-search-trigger]')) {
        loadDocSearch().catch(console.error);
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    const ctrlK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
    const slash = event.key === '/' && !isTyping(event.target);
    if (ctrlK && instance?.isOpen) {
      event.preventDefault();
      instance.close();
    } else if (ctrlK || (slash && !instance?.isOpen)) {
      event.preventDefault();
      openSearch().catch(console.error);
    }
  });

  swup.hooks.on('visit:start', () => instance?.close());
  openSearchFromPage();
}
