// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/jest/
import { MantineProvider } from '@mantine/core';
import type { RenderResult } from '@testing-library/react';
import { render as testingLibraryRender } from '@testing-library/react';

import type { JSX, ReactNode } from 'react';

const theme = {};

export function render(ui: ReactNode, wrapper?: ({ children }: { children: ReactNode }) => JSX.Element): RenderResult {
  return testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MantineProvider theme={theme}>{wrapper ? wrapper({ children }) : children}</MantineProvider>
    ),
  });
}

export { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
