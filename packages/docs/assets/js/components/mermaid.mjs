// Mermaid diagrams render in the browser, as on Docusaurus. Mermaid (and each diagram type it uses) loads only on
// pages that have a diagram, from its ESM build mounted at /js/mermaid (see hugo.toml).

// A variable, so esbuild leaves the dynamic import to the browser instead of bundling it
const MERMAID_URL = '/js/mermaid/mermaid.esm.min.mjs';

let mermaidPromise;
let renderQueue = Promise.resolve();

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
}

async function renderDiagrams({ roots = [document], force = false } = {}) {
  if (!roots.some((root) => root.querySelector('pre.mermaid'))) {
    return;
  }
  mermaidPromise ??= import(MERMAID_URL).then((m) => m.default);
  const mermaid = await mermaidPromise;
  const theme = currentTheme();
  // Hidden panels have no measurable layout. Render them after they become visible, including on tab changes.
  // Query after loading Mermaid in case navigation replaced the original page while the import was pending.
  const blocks = [...new Set(roots.flatMap((root) => [...root.querySelectorAll('pre.mermaid')]))].filter(
    (block) => block.getClientRects().length > 0 && (force || block.dataset.renderedTheme !== theme)
  );
  if (blocks.length === 0) {
    return;
  }
  mermaid.initialize({ startOnLoad: false, theme });

  for (const block of blocks) {
    // Keep the source so the diagram can re-render when the theme changes
    block.dataset.source ??= block.textContent;
    delete block.dataset.renderedTheme;
    block.textContent = block.dataset.source;
    block.removeAttribute('data-processed');
  }
  await mermaid.run({ nodes: blocks });
  for (const block of blocks) {
    block.dataset.renderedTheme = theme;
  }
}

function queueRender(options) {
  // Mermaid uses shared rendering state. Serialize navigation, tab, and theme updates.
  renderQueue = renderQueue.then(() => renderDiagrams(options)).catch(console.error);
}

export function initMermaid() {
  queueRender();
}

// Refresh visible tab diagrams even after a rapid switch interrupted an earlier layout measurement.
document.addEventListener('tabs:change', (event) => queueRender({ roots: event.detail.containers, force: true }));
document.addEventListener(
  'toggle',
  (event) => {
    if (event.target instanceof HTMLDetailsElement && event.target.open) {
      queueRender({ roots: [event.target], force: true });
    }
  },
  true
);

// Re-render with the matching mermaid theme when the site theme changes
new MutationObserver(initMermaid).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
