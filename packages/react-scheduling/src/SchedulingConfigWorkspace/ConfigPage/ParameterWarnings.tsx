// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { SchedulingParameterWarning } from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';

export interface ParameterWarningsProps {
  readonly warnings: readonly SchedulingParameterWarning[];
}

/**
 * The warnings `getSchedulingParameterWarnings` gives about a set of parameters. None of them blocks saving.
 * @param props - The warnings to show.
 * @returns The warnings, or nothing when there are none.
 */
export function ParameterWarnings(props: ParameterWarningsProps): JSX.Element | null {
  if (props.warnings.length === 0) {
    return null;
  }
  return (
    <Stack gap="xs">
      {props.warnings.map((warning) => (
        <Alert
          key={warning.id}
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          data-testid={`warning-${warning.id}`}
        >
          {warning.message}
        </Alert>
      ))}
    </Stack>
  );
}
