// Dev server only: production builds swap diagrams for static SVGs in postprocess-mermaid.mjs
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false });

function render() {
  mermaid.run({ querySelector: 'pre.mermaid:not([data-processed])' }).catch(console.error);
}

// Swup replaces page content without a reload
new MutationObserver(render).observe(document.body, { childList: true, subtree: true });
render();
