// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, UnstyledButton } from '@mantine/core';
import { JSX, ReactNode } from 'react';
import classes from './InfoButton.module.css';

export interface InfoButtonProps {
  readonly onClick?: () => void;
  readonly children: ReactNode;
}

export function InfoButton(props: InfoButtonProps): JSX.Element {
  return (
    <UnstyledButton className={classes.button} onClick={props.onClick}>
      <Group justify="space-between">{props.children}</Group>
    </UnstyledButton>
  );
}
