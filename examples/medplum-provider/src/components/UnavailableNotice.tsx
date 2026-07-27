// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Paper, Stack, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface UnavailableNoticeProps {
  /** Decorative icon shown above the title. Callers should mark it `aria-hidden`. */
  readonly icon: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
}

// Shared presentational card explaining, in a role-aware way, why a workflow or page is
// unavailable (a missing integration, an uninstalled profile, etc.). Centralizing the shell keeps
// these notices visually consistent instead of relying on hand-synced copies.
export function UnavailableNotice(props: UnavailableNoticeProps): JSX.Element {
  const { icon, title, children } = props;
  return (
    <Center p="xl">
      <Paper shadow="md" p="xl" radius="md" withBorder maw={480}>
        <Stack align="center" gap="sm" ta="center">
          {icon}
          <Title order={3}>{title}</Title>
          {children}
        </Stack>
      </Paper>
    </Center>
  );
}
