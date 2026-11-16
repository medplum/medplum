// Mermaid diagrams render in the browser, as on Docusaurus. Mermaid (and each diagram type it uses) loads only on
// pages that have a diagram, from its ESM build mounted at /js/mermaid (see hugo.toml).

// A variable, so esbuild leaves the dynamic import to the browser instead of bundling it
const MERMAID_URL = '/js/mermaid/mermaid.esm.min.mjs';

let mermaidPromise;

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
}

async function renderDiagrams() {
  const blocks = [...document.querySelectorAll('pre.mermaid')];
  if (blocks.length === 0) {
    return;
  }
  mermaidPromise ??= import(MERMAID_URL).then((m) => m.default);
  const mermaid = await mermaidPromise;
  mermaid.initialize({ startOnLoad: false, theme: currentTheme() });

  for (const block of blocks) {
    // Keep the source so the diagram can re-render when the theme changes
    block.dataset.source ??= block.textContent;
    block.textContent = block.dataset.source;
    block.removeAttribute('data-processed');
  }
  await mermaid.run({ nodes: blocks });
}

export function initMermaid() {
  renderDiagrams().catch(console.error);
}

// Re-render with the matching mermaid theme when the site theme changes
new MutationObserver(initMermaid).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
