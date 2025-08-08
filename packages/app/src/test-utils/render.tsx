// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable react-refresh/only-export-components */

// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/jest/

import { MantineProvider } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, RenderResult, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import userEvent, { UserEvent } from '@testing-library/user-event';
import { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppRoutes } from '../AppRoutes';

export { act, fireEvent, RenderResult, screen, userEvent, UserEvent, waitFor };

const theme = {};

export function render(ui: ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: ReactNode }) => <MantineProvider theme={theme}>{children}</MantineProvider>,
  });
}

/**
 * Renders <AppRoutes /> with a MedplumProvider and MemoryRouter
 * Besides reducing boilerplate, this is useful when your test relies
 * on the `navigate` function passed to the MedplumProvider to be wired up
 * to the router since jsdom has not properly implmeneted window.navigate
 * Try this out if you see an error logged like: Error: Not implemented: navigation (except hash changes)
 *
 * @param medplum - The Medplum client, typically a MockClient
 * @param initialUrl - The initial URL
 * @returns The rendered result
 */
export function renderAppRoutes(medplum: MedplumClient, initialUrl: string): RenderResult {
  const router = createMemoryRouter([{ path: '*', element: <AppRoutes /> }], {
    initialEntries: [initialUrl],
    initialIndex: 0,
  });
  return render(
    <MedplumProvider medplum={medplum} navigate={router.navigate}>
      <RouterProvider router={router} />
    </MedplumProvider>
  );
}
