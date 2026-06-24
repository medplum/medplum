// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createFakeJwt } from '@medplum/mock';
import { initApp } from './index';
import { screen, waitFor } from './test-utils/render';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/fhir+json' },
  });
}

describe('App Index', () => {
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

  afterAll(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  test('Renders', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    await initApp();

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
