// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/jest/

import { MantineProvider } from '@mantine/core';
import {
  RenderResult,
  act,
  fireEvent,
  screen,
  render as testingLibraryRender,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export { act, fireEvent, screen, userEvent, waitFor, within };

const theme = {};

export function render(ui: React.ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MantineProvider theme={theme}>{children}</MantineProvider>
    ),
  });
}
