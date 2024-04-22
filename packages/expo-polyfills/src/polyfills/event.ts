// Original source: https://github.com/benlesh/event-target-polyfill/blob/master/index.js
// The package is no longer maintained, so I figured we can vendor it

export function polyfillEvent(): void {
  const root = ((typeof globalThis !== 'undefined' && globalThis) ||
    (typeof self !== 'undefined' && self) ||
    (typeof global !== 'undefined' && global)) as typeof globalThis;

  const shouldPolyfillEvent = (() => {
    try {
      // eslint-disable-next-line no-new
      new root.Event('');
    } catch (_error) {
      return true;
    }
    return false;
  })();

  if (shouldPolyfillEvent) {
    // @ts-expect-error Types don't quite match up but it should be mostly good enough
    root.Event = (() => {
      class Event {
        readonly type: string;
        readonly bubbles: boolean;
        readonly cancelable: boolean;
        readonly composed: boolean;
        defaultPrevented = false;

        constructor(type: string, options: EventInit) {
          this.bubbles = !!options && !!options.bubbles;
          this.cancelable = !!options && !!options.cancelable;
          this.composed = !!options && !!options.composed;
          this.type = type;
        }
      }

      return Event;
    })();
  }
}
