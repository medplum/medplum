// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Sets up MantineProvider for all tests
// See: https://mantine.dev/guides/vitest/

import { MantineProvider } from '@mantine/core';
import type { RenderResult } from '@testing-library/react';
import { render as testingLibraryRender } from '@testing-library/react';
import type { ReactNode } from 'react';

export function render(ui: ReactNode): RenderResult {
  return testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <MantineProvider env="test">{children}</MantineProvider>,
  });
}
