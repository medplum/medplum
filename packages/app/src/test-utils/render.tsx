/* eslint-disable react-refresh/only-export-components */
// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/jest/

import { MantineProvider } from '@mantine/core';
import { RenderResult, act, fireEvent, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export { RenderResult, act, fireEvent, screen, userEvent, waitFor };

const theme = {};

export function render(ui: React.ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MantineProvider theme={theme}>{children}</MantineProvider>
    ),
  });
}
