import { Event } from './event';

// Original source: https://github.com/benlesh/event-target-polyfill/blob/master/index.js
// The package is no longer maintained, so I figured we can vendor it

export function polyfillEvent(): void {
  const root = ((typeof globalThis !== 'undefined' && globalThis) ||
    (typeof self !== 'undefined' && self) ||
    (typeof global !== 'undefined' && global)) as typeof globalThis;

  const shouldPolyfillEvent = (() => {
    if (typeof root.Event === 'undefined') {
      return true;
    }
    try {
      // eslint-disable-next-line no-new
      new root.Event('');
    } catch (_error) {
      return true;
    }
    return false;
  })();

  if (shouldPolyfillEvent) {
    root.Event = Event;
  }
}
