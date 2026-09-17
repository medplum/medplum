// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';

interface DiscouragedTimezoneInputProps {
  readonly label: string;
  readonly value: string | undefined;
  /** Shown under the field while a value is stored. */
  readonly description: string;
  /** Shown under the field when the resource never had one, naming what applies instead. */
  readonly unsetDescription: string;
  /** Shown under the field once the value is marked for removal, naming what takes effect instead. */
  readonly removedDescription: string;
  readonly disabled: boolean | undefined;
  readonly onChange: (value: string | undefined) => void;
  readonly testId: string;
}

/**
 * Shows a time zone stored where scheduling accepts one but this form does not offer to set one, read-only,
 * with a way to remove it. Nothing new can be entered, so the field only ever offers to undo what is there.
 *
 * @param props - Label, current value, the copy for each state, and a change handler.
 * @returns The read-only time zone field.
 */
export function DiscouragedTimezoneInput(props: DiscouragedTimezoneInputProps): JSX.Element {
  const { label, value, description, unsetDescription, removedDescription, disabled, onChange, testId } = props;
  // Captured on mount, which is safe because the owning editor is seeded once too. A field that arrives
  // empty has nothing to remove, so it reads as unset rather than as a removal waiting to be undone.
  const [stored] = useState(value);
  const removed = stored !== undefined && value === undefined;

  let fieldDescription = description;
  if (stored === undefined) {
    fieldDescription = unsetDescription;
  } else if (removed) {
    fieldDescription = removedDescription;
  }

  return (
    <TextInput
      label={label}
      description={fieldDescription}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      value={value ?? ''}
      placeholder="Not set"
      readOnly
      disabled={disabled}
      rightSectionWidth={stored === undefined ? undefined : 80}
      rightSectionPointerEvents="all"
      rightSection={
        stored === undefined ? undefined : (
          <Button
            variant="subtle"
            size="compact-xs"
            disabled={disabled}
            onClick={() => onChange(removed ? stored : undefined)}
            data-testid={`${testId}-${removed ? 'restore' : 'remove'}`}
          >
            {removed ? 'Undo' : 'Remove'}
          </Button>
        )
      }
      data-testid={testId}
    />
  );
}
