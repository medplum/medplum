// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface LabDetailLayoutProps {
  readonly title: ReactNode;
  readonly subtitle: ReactNode;
  readonly actions: ReactNode;
  readonly children: ReactNode;
}

export function LabDetailLayout(props: LabDetailLayoutProps): JSX.Element {
  return (
    <ScrollArea h="100%">
      <Paper h="100%">
        <Stack gap="0">
          <Stack gap="md" p="md">
            <Stack gap="0">
              <Text size="xl" fw={800}>
                {props.title}
              </Text>
              <Text size="sm" c="gray.7">
                {props.subtitle}
              </Text>
            </Stack>
            <Divider />
            {props.actions}
          </Stack>
          <Stack gap="xs" p="md">
            {props.children}
          </Stack>
        </Stack>
      </Paper>
    </ScrollArea>
  );
}
