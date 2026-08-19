// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

function applyEnvironmentFavicon(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const { hostname } = window.location;
  if (hostname === 'medplum.com' || hostname.endsWith('.medplum.com')) {
    return;
  }
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(hostname) || /\.local(host)?$/.test(hostname);
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.href = isLocal ? '/favicon-local.ico' : '/favicon-staging.ico';
  }
}

applyEnvironmentFavicon();

export function onRouteDidUpdate(): void {
  applyEnvironmentFavicon();
}
