// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Environment detection utilities that can be mocked in tests.
 * These functions replace direct checks of global objects to avoid
 * the need to manipulate non-configurable globalThis.window in Jest/JSDOM 23+.
 */

/**
 * Returns true if running in a browser environment with window available.
 * @returns True if in browser environment.
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Returns true if running in Node.js environment with Buffer available.
 * @returns True if in Node.js environment.
 */
export function isNodeEnvironment(): boolean {
  return typeof Buffer !== 'undefined';
}

/**
 * Returns the global window object if available.
 * @returns The window object or undefined.
 */
export function getWindow(): Window | undefined {
  return typeof window !== 'undefined' ? window : undefined;
}

/**
 * Returns the global Buffer constructor if available.
 * @returns The Buffer constructor or undefined.
 */
export function getBuffer(): typeof Buffer | undefined {
  return typeof Buffer !== 'undefined' ? Buffer : undefined;
}

/**
 * Location utilities that can be mocked in tests.
 * These functions wrap location calls to avoid JSDOM 23+ restrictions.
 */
export const locationUtils = {
  assign(url: string): void {
    if (isBrowserEnvironment()) {
      globalThis.location.assign(url);
    }
  },

  reload(): void {
    if (isBrowserEnvironment()) {
      globalThis.location.reload();
    }
  },

  getSearch(): string {
    return isBrowserEnvironment() ? globalThis.location.search : '';
  },

  getPathname(): string {
    return isBrowserEnvironment() ? globalThis.location.pathname : '';
  },

  getLocation(): string {
    return isBrowserEnvironment() ? globalThis.location.toString() : '';
  },

  getOrigin(): string {
    return isBrowserEnvironment() ? globalThis.location.protocol + '//' + globalThis.location.host + '/' : '';
  },
};
