// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/vitest/

import { MantineProvider } from '@mantine/core';
import { render as testingLibraryRender } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

export function render(ui: React.ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: React.ReactNode }) => <MantineProvider>{children}</MantineProvider>,
  });
}

export { act, fireEvent, screen, waitFor } from '@testing-library/react';
export type { RenderResult } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
export type { UserEvent } from '@testing-library/user-event';
