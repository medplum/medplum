/* eslint-disable no-nested-ternary */

/**
 * The global object.
 */
//istanbul ignore next
export const Global: any =
  typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
      ? self
      : typeof global !== 'undefined'
        ? global
        : typeof globalThis !== 'undefined'
          ? globalThis
          : undefined;
