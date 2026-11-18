// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { createFakeJwt } from '@medplum/mock';
import type { Root } from 'react-dom/client';
import { initApp } from './index';
import { act, screen, waitFor } from './test-utils/render';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/fhir+json' },
  });
}

describe('App Index', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;
  let medplum: MedplumClient | undefined;

  beforeAll(() => {
    window.localStorage.setItem(
      '@medplum:activeLogin',
      JSON.stringify({
        accessToken: createFakeJwt({ client_id: '123', login_id: '123' }),
        refreshToken: '456',
        project: { reference: 'Project/123' },
        profile: { reference: 'Practitioner/124' },
      })
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        let url: string;
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.href;
        } else {
          url = input.url;
        }

        if (url.includes('auth/me')) {
          return jsonResponse({
            project: { resourceType: 'Project', id: '123', name: 'Test' },
            membership: { resourceType: 'ProjectMembership', id: '123' },
            profile: { resourceType: 'Practitioner', id: '123', name: [{ given: ['Admin'] }] },
            config: { resourceType: 'UserConfiguration', id: '123' },
            accessPolicy: { resourceType: 'AccessPolicy', id: '123' },
          });
        }

        if (url.includes('fhir/R4')) {
          return jsonResponse({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [],
          });
        }

        return jsonResponse({});
      })
    );
  });

  afterAll(async () => {
    // Unmount so React and Mantine timers don't fire after the jsdom environment is torn down
    act(() => root?.unmount());
    container?.remove();

    // Likewise, let the client finish startup and settle every request it sent
    const client = medplum;
    if (client) {
      await client.getInitPromise();
      await vi.waitFor(() => expect(client.isLoading()).toBe(false));
      await Promise.allSettled(vi.mocked(fetch).mock.results.map((result) => result.value));
    }

    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  test('Renders', async () => {
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    ({ root, medplum } = initApp());

    // createBrowserRouter + jsdom does not reliably complete HomePage URL redirects, so verify
    // initApp mounted an authenticated App shell instead of search-control specifically.
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument();
        expect(screen.getByTitle('Medplum Logo')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });
});
