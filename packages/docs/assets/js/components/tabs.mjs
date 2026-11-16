// Tabs (layouts/shortcodes/tabs.html and the FHIR reference), with the behavior of Docusaurus's Tabs:
// - data-group-id: choosing a tab selects the same value in every group with that id, and the choice is remembered
//   for later pages
// - data-query-string: the selected value is kept in that URL query parameter (?section=usage), so a link can open a
//   tab; it takes priority over a remembered choice

// The localStorage key the Docusaurus site used (its tab keys end in a site-specific suffix), so readers keep their choice
const storageKey = (groupId) => `docusaurus.tab.${groupId}-59d`;

function readStoredValue(groupId) {
  try {
    return localStorage.getItem(storageKey(groupId));
  } catch {
    return null;
  }
}

function storeValue(groupId, value) {
  try {
    localStorage.setItem(storageKey(groupId), value);
  } catch {
    // Storage can be unavailable (private browsing, blocked site data); the choice just isn't remembered
  }
}

function panelsOf(container) {
  return Array.from(container.querySelectorAll(':scope > .tab-panel'));
}

// Shows the panel with the given value, if the container has one; returns whether it did
function select(container, value) {
  const panels = panelsOf(container);
  const index = panels.findIndex((panel) => panel.dataset.tabValue === value);
  if (index < 0) {
    return false;
  }
  const buttons = container.querySelectorAll(':scope > .tabs-button-group > .tabs-button');
  panels.forEach((panel, i) => {
    panel.classList.toggle('active', i === index);
    buttons[i]?.classList.toggle('active', i === index);
    buttons[i]?.setAttribute('aria-selected', String(i === index));
  });
  return true;
}

function onTabClick(container, value) {
  select(container, value);
  const { groupId, queryString } = container.dataset;
  if (groupId) {
    storeValue(groupId, value);
    document.querySelectorAll('.tabs-container').forEach((other) => {
      if (other !== container && other.dataset.groupId === groupId) {
        select(other, value);
      }
    });
  }
  if (queryString) {
    // Replace rather than push, as Docusaurus did, so switching tabs doesn't add history entries
    const url = new URL(window.location.href);
    url.searchParams.set(queryString, value);
    window.history.replaceState(window.history.state, '', url);
  }
}

export function initTabs() {
  const params = new URLSearchParams(window.location.search);
  document.querySelectorAll('.tabs-container').forEach((container) => {
    // Skip if already initialized
    if (container.querySelector(':scope > .tabs-button-group')) {
      return;
    }
    const panels = panelsOf(container);
    if (panels.length === 0) {
      return;
    }

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'tabs-button-group';
    buttonGroup.setAttribute('role', 'tablist');
    for (const panel of panels) {
      const button = document.createElement('button');
      button.className = 'tabs-button';
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.textContent = panel.dataset.tabLabel;
      button.addEventListener('click', () => onTabClick(container, panel.dataset.tabValue));
      buttonGroup.appendChild(button);
    }
    container.prepend(buttonGroup);

    // The URL's value, else the remembered one, else the first tab
    const { groupId, queryString } = container.dataset;
    const initial = [queryString && params.get(queryString), groupId && readStoredValue(groupId)].find(
      (value) => value && panels.some((panel) => panel.dataset.tabValue === value)
    );
    select(container, initial ?? panels[0].dataset.tabValue);
  });
}
