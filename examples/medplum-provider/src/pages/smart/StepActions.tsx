// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface StepActionsProps {
  readonly children: ReactNode;
}

/**
 * Divider + full-width action button closing out a step. Kept in the step body rather than the
 * Modal's `actions` slot because the flow also renders as a page, where there is no modal footer.
 * @param props - The StepActions React props.
 * @param props.children - The action buttons to render below the divider.
 * @returns The step actions React node.
 */
export function StepActions({ children }: StepActionsProps): JSX.Element {
  return (
    <Stack gap="lg" pt="lg">
      <Divider />
      <Stack gap="sm">{children}</Stack>
    </Stack>
  );
}
