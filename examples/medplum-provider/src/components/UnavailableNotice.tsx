// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface UnavailableNoticeProps {
  /** Decorative icon shown above the title. Callers should mark it `aria-hidden`. */
  readonly icon: ReactNode;
  readonly title: ReactNode;
  /** Dimmed prose shown under the title. */
  readonly description?: ReactNode;
  /** Anything that follows the description — what is missing, where to go next. */
  readonly children?: ReactNode;
}

// Shared presentational notice explaining, in a role-aware way, why a workflow or page is
// unavailable (a missing integration, an uninstalled profile, etc.). Centralizing the shell keeps
// these notices visually consistent instead of relying on hand-synced copies.
//
// The props and slot order deliberately mirror Mantine's `EmptyState` (icon, title, description,
// then children; no card container of its own) so that this collapses into that component when we
// move to Mantine >= 9.4.
export function UnavailableNotice(props: UnavailableNoticeProps): JSX.Element {
  const { icon, title, description, children } = props;
  return (
    <Center p="xl">
      <Stack align="center" gap="sm" ta="center" maw={480}>
        {icon}
        <Title order={3}>{title}</Title>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        {children}
      </Stack>
    </Center>
  );
}
