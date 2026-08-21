// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

function resolveEnvironmentFavicon(): string | null {
  const { hostname } = window.location;
  if (hostname === 'medplum.com' || hostname.endsWith('.medplum.com')) {
    return null;
  }
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(hostname) || /\.local(host)?$/.test(hostname);
  return isLocal ? '/favicon-local.ico' : '/favicon-staging.ico';
}

if (typeof document !== 'undefined') {
  const target = resolveEnvironmentFavicon();
  if (target) {
    const apply = (): void => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link && link.getAttribute('href') !== target) {
        link.setAttribute('href', target);
      }
    };
    apply();
    // react-helmet resets the favicon to the config default on every render, so re-apply on head mutations.
    new MutationObserver(apply).observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }
}

export {};
