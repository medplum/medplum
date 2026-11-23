// Progressive enhancement for the comparison page. Without JavaScript, both full tables remain readable.
// Desktop shows two competitor columns; tablets and phones show one. Each header opens a menu that swaps its competitor.

let controller;

function parseSelection(value, allowed, defaults) {
  const ids = [...(value ?? '').split(','), ...defaults, ...allowed].map((id) => id.trim());
  return [...new Set(ids.filter((id) => allowed.includes(id)))].slice(0, 2);
}

function setMenu(picker, open) {
  picker.querySelector('[data-comparison-trigger]').setAttribute('aria-expanded', String(open));
  picker.querySelector('[data-comparison-menu]').hidden = !open;
}

export function initComparisons() {
  destroyComparisons();
  const root = document.querySelector('[data-comparisons]');
  if (!root) {
    return;
  }
  controller = new AbortController();
  const { signal } = controller;
  const tabs = [...root.querySelectorAll('[data-comparison-tab]')];
  const pickers = [...root.querySelectorAll('[data-comparison-picker]')];
  const singleColumn = window.matchMedia('(max-width: 996px)');
  const pathname = window.location.pathname.replace(/\/$/, '');
  const groups = [...root.querySelectorAll('[data-comparison]')].map((section) => ({
    section,
    id: section.dataset.comparison,
    allowed: [...section.querySelectorAll('thead [data-competitor]')].map((cell) => cell.dataset.competitor).filter((id) => id !== 'medplum'),
    defaults: (section.dataset.default ?? '').split(','),
    selected: [],
    rows: [...section.querySelectorAll('table tr')],
    columns: [...section.querySelectorAll('[data-competitor]')],
    options: [...section.querySelectorAll('[data-comparison-option]')],
  }));
  let activeId;

  const visible = (group) => (singleColumn.matches ? group.selected.slice(0, 1) : group.selected);
  const closeMenus = (except) => pickers.forEach((picker) => picker !== except && setMenu(picker, false));
  const triggerAt = (group, position) =>
    group.section.querySelector(`thead [data-competitor="${visible(group)[Math.min(position, visible(group).length - 1)]}"] [data-comparison-trigger]`);

  function readUrl() {
    const url = new URL(window.location.href);
    const ids = groups.map((group) => group.id);
    const requested = ids.filter((id) => url.searchParams.has(id));
    activeId = ids.includes(url.hash.slice(1)) ? url.hash.slice(1) : requested.length === 1 ? requested[0] : ids[0];
    for (const group of groups) {
      group.selected = parseSelection(url.searchParams.get(group.id), group.allowed, group.defaults);
    }
  }

  function writeUrl() {
    const url = new URL(window.location.href);
    url.hash = activeId;
    for (const group of groups) {
      if (url.searchParams.has(group.id) || group.selected.join(',') !== group.defaults.join(',')) {
        url.searchParams.set(group.id, group.selected.join(','));
      }
    }
    if (url.href !== window.location.href) {
      // Swup uses state.url when handling Back/Forward. Preserve its other state and update that URL too.
      window.history.pushState({ ...window.history.state, url: url.pathname + url.search + url.hash }, '', url);
    }
  }

  function render() {
    closeMenus();
    for (const group of groups) {
      const shown = visible(group);
      const order = ['medplum', ...group.selected, ...group.allowed.filter((id) => !group.selected.includes(id))];
      for (const row of group.rows) {
        const cells = [...row.children];
        const ordered = [...cells.filter((cell) => !cell.dataset.competitor), ...order.map((id) => cells.find((cell) => cell.dataset.competitor === id))];
        // Moving a focused cell drops focus, so only reorder rows whose order changed.
        if (ordered.some((cell, index) => cell !== cells[index])) {
          row.append(...ordered);
        }
      }
      for (const column of group.columns) {
        column.hidden = column.dataset.competitor !== 'medplum' && !shown.includes(column.dataset.competitor);
      }
      // A competitor already shown in the other column stays listed but can't be picked again.
      for (const option of group.options) {
        const value = option.dataset.comparisonOption;
        if (value !== option.closest('[data-competitor]').dataset.competitor && shown.includes(value)) {
          option.setAttribute('aria-disabled', 'true');
        } else {
          option.removeAttribute('aria-disabled');
        }
      }
      group.section.hidden = group.id !== activeId;
    }
    for (const tab of tabs) {
      const active = tab.dataset.comparisonTab === activeId;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    root.dataset.enhanced = 'true';
  }

  function choose(option) {
    if (option.getAttribute('aria-disabled') === 'true') {
      return;
    }
    const group = groups.find((candidate) => candidate.section.contains(option));
    const position = group.selected.indexOf(option.closest('[data-competitor]').dataset.competitor);
    const value = option.dataset.comparisonOption;
    // On smaller screens the second choice is hidden but kept, so picking it swaps the two.
    const duplicate = group.selected.indexOf(value);
    if (duplicate >= 0) {
      group.selected[duplicate] = group.selected[position];
    }
    group.selected[position] = value;
    render();
    writeUrl();
    triggerAt(group, position).focus({ preventScroll: true });
  }

  function selectTab(tab) {
    activeId = tab.dataset.comparisonTab;
    render();
    writeUrl();
  }

  root.querySelector('[data-comparison-tabs]')?.setAttribute('role', 'tablist');
  for (const tab of tabs) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', tab.dataset.comparisonTab);
  }
  for (const { section, id } of groups) {
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', `compare-tab-${id}`);
  }

  function onClick(event) {
    const trigger = event.target.closest('[data-comparison-trigger]');
    const option = event.target.closest('[data-comparison-option]');
    const tab = event.target.closest('[data-comparison-tab]');
    if (trigger) {
      const picker = trigger.closest('[data-comparison-picker]');
      closeMenus(picker);
      setMenu(picker, trigger.getAttribute('aria-expanded') !== 'true');
    } else if (option) {
      choose(option);
    } else if (tabs.includes(tab) && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      selectTab(tab);
    }
  }

  function onKeyDown(event) {
    const picker = event.target.closest('[data-comparison-picker]');
    if (picker) {
      const trigger = picker.querySelector('[data-comparison-trigger]');
      const options = [...picker.querySelectorAll('[data-comparison-option]:not([aria-disabled="true"])')];
      const index = options.indexOf(event.target);
      if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
        setMenu(picker, false);
        trigger.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        closeMenus(picker);
        setMenu(picker, true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = index < 0 ? options.findIndex((candidate) => candidate.hasAttribute('aria-current')) : (index + step + options.length) % options.length;
        options[next].focus();
      }
      return;
    }
    const tabIndex = tabs.indexOf(event.target.closest('[data-comparison-tab]'));
    const targets = {
      ArrowLeft: (tabIndex + tabs.length - 1) % tabs.length,
      ArrowRight: (tabIndex + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
      ' ': tabIndex,
    };
    if (tabIndex >= 0 && event.key in targets) {
      event.preventDefault();
      event.stopPropagation();
      selectTab(tabs[targets[event.key]]);
      tabs[targets[event.key]].focus({ preventScroll: true });
    }
  }

  // Close an open menu when a click or focus lands outside it.
  function onOutside(event) {
    closeMenus(event.target.closest?.('[data-comparison-picker]'));
  }

  function onHistory() {
    if (window.location.pathname.replace(/\/$/, '') === pathname) {
      readUrl();
      render();
    }
  }

  // Swup replaces the page on navigation, so teardown only has to detach these listeners.
  root.addEventListener('click', onClick, { signal });
  root.addEventListener('keydown', onKeyDown, { signal });
  document.addEventListener('click', onOutside, { signal });
  document.addEventListener('focusin', onOutside, { signal });
  singleColumn.addEventListener('change', render, { signal });
  window.addEventListener('popstate', onHistory, { signal });
  window.addEventListener('hashchange', onHistory, { signal });
  readUrl();
  render();
}

export function destroyComparisons() {
  controller?.abort();
}
