// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { RenderResult } from '../../test-utils/render';
import { act, render } from '../../test-utils/render';

/**
 * Renders a settings page at a route, so pages that read or write the URL can be tested.
 * @param medplum - The mock client.
 * @param element - The page to render.
 * @param initialEntry - The starting URL, matched against `path`.
 * @param path - The route the page is mounted at.
 * @returns The render result and the router.
 */
export async function renderSettingsPage(
  medplum: MockClient,
  element: JSX.Element,
  initialEntry = '/settings/page',
  path = '/settings/page'
): Promise<RenderResult & { router: ReturnType<typeof createMemoryRouter> }> {
  const router = createMemoryRouter([{ path, element }], { initialEntries: [initialEntry] });
  let result: RenderResult | undefined;
  await act(async () => {
    result = render(
      <MedplumProvider medplum={medplum} navigate={(path) => router.navigate(path)}>
        <Notifications />
        <RouterProvider router={router} />
      </MedplumProvider>
    );
  });
  return { ...(result as RenderResult), router };
}
