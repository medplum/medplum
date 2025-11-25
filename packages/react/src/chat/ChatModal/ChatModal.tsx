// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon } from '@mantine/core';
import { useMedplumProfile } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import classes from './ChatModal.module.css';

export interface ChatModalProps {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly children: ReactNode;
}

export function ChatModal(props: ChatModalProps): JSX.Element | null {
  const { open, setOpen, children } = props;
  const profile = useMedplumProfile();

  if (!profile) {
    return null;
  }

  return (
    <>
      {open && <div className={classes.chatModalContainer}>{children}</div>}
      {open ? (
        <div className={classes.iconContainer}>
          <ActionIcon
            className={classes.icon}
            color="blue"
            size="lg"
            radius="xl"
            variant="outline"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
          >
            <IconChevronDown size="1.625rem" />
          </ActionIcon>
        </div>
      ) : (
        <div className={classes.iconContainer}>
          <ActionIcon
            className={classes.icon}
            color="blue"
            size="lg"
            radius="xl"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label="Open chat"
          >
            <IconChevronUp size="1.625rem" />
          </ActionIcon>
        </div>
      )}
    </>
  );
}
