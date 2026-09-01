// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

function resolveEnvironmentFavicon(): string | null {
  const { hostname } = window.location;
  if (hostname === 'medplum.com' || hostname.endsWith('.medplum.com')) {
    return null;
  }
  const isLocal =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /\.local(host)?$/.test(hostname);
  return isLocal ? '/favicon-local.ico' : '/favicon-staging.ico';
}

if (typeof document !== 'undefined') {
  const target = resolveEnvironmentFavicon();
  if (target) {
    const apply = (): void => {
      let hasOurs = false;
      document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((link) => {
        if (link.dataset.medplumEnvFavicon) {
          hasOurs = true;
        } else {
          link.remove();
        }
      });
      if (!hasOurs) {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/x-icon';
        link.href = target;
        link.dataset.medplumEnvFavicon = 'true';
        document.head.appendChild(link);
      }
    };
    apply();
    // react-helmet re-adds the config favicon on every render; remove it and keep our own appended link.
    // WebKit ignores in-place href changes on a loaded icon link, so replace the element rather than mutate it.
    new MutationObserver(apply).observe(document.head, { childList: true, subtree: true });
  }
}

export {};
