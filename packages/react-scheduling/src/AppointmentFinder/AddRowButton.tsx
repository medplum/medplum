// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { IconCirclePlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './AppointmentFinder.module.css';

export interface AddRowButtonProps {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

/**
 * Adds a row to a list of fields, drawn as SearchControl draws its "Add Filter" and "Add Sort".
 * @param props - The React props.
 * @returns The button.
 */
export function AddRowButton(props: AddRowButtonProps): JSX.Element {
  return (
    <Button
      className={classes.addButton}
      size="compact-sm"
      variant="subtle"
      color="blue"
      leftSection={<IconCirclePlus size={16} />}
      fw={500}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}
