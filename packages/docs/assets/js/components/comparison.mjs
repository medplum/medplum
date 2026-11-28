// Enhance the comparison hub's segment links. All cards and detail tables work without JavaScript.
let controller;

export function initComparisons() {
  destroyComparisons();
  const root = document.querySelector('[data-comparisons]');
  if (!root) {
    return;
  }
  controller = new AbortController();
  const { signal } = controller;
  const tabs = [...root.querySelectorAll('[data-comparison-tab]')];
  const sections = [...root.querySelectorAll('[data-comparison]')];
  const ids = sections.map((section) => section.dataset.comparison);
  const pathname = window.location.pathname.replace(/\/$/, '');
  let activeId;

  function render() {
    for (const section of sections) {
      section.hidden = section.dataset.comparison !== activeId;
    }
    for (const tab of tabs) {
      const active = tab.dataset.comparisonTab === activeId;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    root.dataset.enhanced = 'true';
  }

  function readUrl() {
    const url = new URL(window.location.href);
    const requested = ids.filter((id) => url.searchParams.has(id));
    activeId = ids.includes(url.hash.slice(1)) ? url.hash.slice(1) : requested.length === 1 ? requested[0] : ids[0];
    render();
  }

  function selectTab(tab) {
    activeId = tab.dataset.comparisonTab;
    render();
    const url = new URL(window.location.href);
    url.hash = activeId;
    ids.forEach((id) => url.searchParams.delete(id));
    if (url.href !== window.location.href) {
      window.history.pushState({ ...window.history.state, url: url.pathname + url.search + url.hash }, '', url);
    }
  }

  root.querySelector('[data-comparison-tabs]').setAttribute('role', 'tablist');
  for (const tab of tabs) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', tab.dataset.comparisonTab);
  }
  for (const section of sections) {
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', 'compare-tab-' + section.dataset.comparison);
  }

  root.addEventListener(
    'click',
    (event) => {
      const tab = event.target.closest('[data-comparison-tab]');
      if (tabs.includes(tab) && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        selectTab(tab);
      }
    },
    { signal }
  );

  root.addEventListener(
    'keydown',
    (event) => {
      const index = tabs.indexOf(event.target.closest('[data-comparison-tab]'));
      if (index < 0) {
        return;
      }
      const targets = {
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
        ' ': index,
      };
      if (event.key in targets) {
        event.preventDefault();
        event.stopPropagation();
        const tab = tabs[targets[event.key]];
        selectTab(tab);
        tab.focus({ preventScroll: true });
      }
    },
    { signal }
  );

  function onHistory() {
    if (window.location.pathname.replace(/\/$/, '') === pathname) {
      readUrl();
    }
  }
  window.addEventListener('popstate', onHistory, { signal });
  window.addEventListener('hashchange', onHistory, { signal });
  readUrl();
}

export function destroyComparisons() {
  controller?.abort();
}
