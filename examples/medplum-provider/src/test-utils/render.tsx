// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/vitest/

import { MantineProvider } from '@mantine/core';
import type { RenderResult } from '@testing-library/react';
import { act, fireEvent, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';

export { act, fireEvent, screen, userEvent, waitFor };
export type { RenderResult, UserEvent };

export function render(ui: React.ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: React.ReactNode }) => <MantineProvider>{children}</MantineProvider>,
  });
}
