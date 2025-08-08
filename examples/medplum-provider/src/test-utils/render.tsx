// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable react-refresh/only-export-components */

// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/vitest/

import { MantineProvider } from '@mantine/core';
import { act, fireEvent, RenderResult, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import userEvent, { UserEvent } from '@testing-library/user-event';

export { act, fireEvent, RenderResult, screen, userEvent, UserEvent, waitFor };

export function render(ui: React.ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: React.ReactNode }) => <MantineProvider>{children}</MantineProvider>,
  });
}
