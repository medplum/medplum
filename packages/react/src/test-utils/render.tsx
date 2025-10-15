// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/jest/
import { MantineProvider } from '@mantine/core';
import type { RenderResult } from '@testing-library/react';
import { act, fireEvent, screen, render as testingLibraryRender, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';

export { act, fireEvent, screen, userEvent, waitFor, within };

const theme = {};

export function render(ui: ReactNode, wrapper?: ({ children }: { children: ReactNode }) => JSX.Element): RenderResult {
  return testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MantineProvider theme={theme}>{wrapper ? wrapper({ children }) : children}</MantineProvider>
    ),
  });
}
