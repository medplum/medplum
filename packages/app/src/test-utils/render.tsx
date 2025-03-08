/* eslint-disable react-refresh/only-export-components */
// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/jest/

import { MantineProvider } from '@mantine/core';
import { RenderResult, act, fireEvent, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import userEvent, { UserEvent } from '@testing-library/user-event';
import { ReactNode } from 'react';

export { RenderResult, act, fireEvent, screen, userEvent, UserEvent, waitFor };

const theme = {};

export function render(ui: ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: ReactNode }) => <MantineProvider theme={theme}>{children}</MantineProvider>,
  });
}
