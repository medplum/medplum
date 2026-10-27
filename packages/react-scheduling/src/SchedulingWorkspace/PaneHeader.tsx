// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Divider, Group, Title } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import classes from './PaneHeader.module.css';

export interface PaneHeaderProps {
  /** A title, or anything else to put in its place, such as tabs. */
  readonly title: ReactNode;
  /** Names the close button for assistive technology. */
  readonly closeLabel: string;
  readonly onClose: () => void;
}

/**
 * The header across the top of a pane beside the calendar: what it holds, a button closing
 * it, and a rule under both.
 * @param props - The React props.
 * @returns The header.
 */
export function PaneHeader(props: PaneHeaderProps): JSX.Element {
  const { title, closeLabel, onClose } = props;
  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        {typeof title === 'string' ? <Title order={4}>{title}</Title> : title}
        <ActionIcon
          className={classes.close}
          variant="transparent"
          color="gray"
          size={32}
          radius="xl"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      <Divider />
    </>
  );
}
