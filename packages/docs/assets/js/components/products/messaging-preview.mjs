// Messaging capability preview: sizes each chat bubble to its measured text width.
// The server-rendered bubbles use a character-count estimate; this replaces it with the real width.
// Port of MessagingPreview in CapabilityPreviews.tsx; the constants must match it.

const PAD_X = 13; // horizontal padding inside each bubble
const RIGHT_X = 280; // right edge of outgoing bubbles

export function initMessagingPreview(root) {
  root.querySelectorAll('svg[data-measure-bubbles] g').forEach((group) => {
    const rect = group.querySelector('rect');
    const text = group.querySelector('text');
    if (!rect || !text) {
      return;
    }
    const width = text.getComputedTextLength() + PAD_X * 2;
    rect.setAttribute('width', String(width));
    if (text.getAttribute('text-anchor') === 'end') {
      rect.setAttribute('x', String(RIGHT_X - width));
    }
  });
  return undefined;
}
