// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';

export interface ConfirmModalProps {
  readonly opened: boolean;
  readonly title: ReactNode;
  /** What confirming does, in a sentence or two. */
  readonly children: ReactNode;
  /** What confirming risks, shown as a warning below. */
  readonly warning?: ReactNode;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  /** Marks the confirm button red, for one that discards or removes something. */
  readonly destructive?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * Asks before a change in the configuration workspace goes ahead.
 * @param props - What is asked, the two answers, and what each does.
 * @returns The dialog.
 */
export function ConfirmModal(props: ConfirmModalProps): JSX.Element {
  return (
    <Modal opened={props.opened} onClose={props.onCancel} title={props.title} centered>
      <Stack gap="md">
        <Text size="sm">{props.children}</Text>
        {props.warning && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            {props.warning}
          </Alert>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={props.onCancel}>
            {props.cancelLabel}
          </Button>
          <Button color={props.destructive ? 'red' : undefined} onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
