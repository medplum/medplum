// Kapa AI widget integration, ported from the Docusaurus src/theme/Root.tsx.
// The widget script and the window.Kapa call queue are in layouts/partials/head-tags.html.

/** Host element the Kapa widget bundle appends to <body>. Its shadow root holds the whole UI. */
const WIDGET_CONTAINER_ID = 'kapa-widget-container';

/** Toggled on <html> while the sidebar is open, so CSS can inset the page by its width. */
const OPEN_ATTRIBUTE = 'data-kapa-sidebar';

/**
 * Returns the anchor that was clicked, but only when the click originated inside the Kapa widget.
 * The widget lives in an open shadow root, so only the composed path exposes the anchor.
 * @param {MouseEvent} event - The click event.
 * @returns {HTMLAnchorElement | undefined} The anchor inside the widget, if any.
 */
function findWidgetAnchor(event) {
  let anchor;
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement) {
      anchor ??= node;
    } else if (node instanceof HTMLElement && node.id === WIDGET_CONTAINER_ID) {
      return anchor;
    }
  }
  return undefined;
}

/**
 * Wires the Kapa sidebar into the page.
 * @param {{ navigate: (url: string) => void }} swup - The swup instance, for in-page navigation.
 */
export function initKapa(swup) {
  if (window.Kapa) {
    window.Kapa('onModalOpen', () => document.documentElement.setAttribute(OPEN_ATTRIBUTE, 'open'));
    window.Kapa('onModalClose', () => document.documentElement.removeAttribute(OPEN_ATTRIBUTE));
  }

  // Kapa opens answer and source links in a new tab. Navigating same-origin ones with swup instead keeps
  // the conversation on screen, since the widget lives outside the swup container.
  document.addEventListener(
    'click',
    (event) => {
      const opensElsewhere = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (event.defaultPrevented || event.button !== 0 || opensElsewhere) {
        return;
      }
      const anchor = findWidgetAnchor(event);
      if (!anchor?.href || anchor.origin !== window.location.origin) {
        return;
      }
      event.preventDefault();
      swup.navigate(anchor.pathname + anchor.search + anchor.hash);
    },
    // Capture phase, so this runs before the widget's own handler opens a tab
    true
  );
}
