// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Defines a no-op `window.gtag` outside production so the Google gtag plugin's route-change hook
 * cannot throw `TypeError: window.gtag is not a function`.
 *
 * `docusaurus build` and `docusaurus start` share one `.docusaurus` cache directory. A production
 * build registers the gtag plugin and writes its client module into the generated
 * `.docusaurus/client-modules.js`; a dev server does not, because the plugin disables itself outside
 * production. Run a build while a dev server is up and the dev server hot-reloads that regenerated
 * file, picking up a hook that calls `window.gtag` on every navigation — but the gtag.js snippet
 * that defines the function is only ever injected into production HTML.
 *
 * Restarting the dev server also clears it. This makes the state unreachable in the first place.
 */
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag !== 'function') {
    w.gtag = () => {};
  }
}

export {};
