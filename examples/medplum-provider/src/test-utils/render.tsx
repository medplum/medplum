// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/vitest/

import { MantineProvider } from '@mantine/core';
import { act, fireEvent, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';

export type { RenderResult, UserEvent };
export { act, fireEvent, screen, userEvent, waitFor };

export function render(ui: React.ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: React.ReactNode }) => <MantineProvider>{children}</MantineProvider>,
  });
}
