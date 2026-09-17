// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { getTimezoneOptions } from './SchedulingParametersEditor.utils';

interface TimezoneSelectProps {
  readonly label: string;
  readonly description?: string;
  readonly value: string | undefined;
  readonly placeholder: string;
  readonly error: string | undefined;
  readonly disabled: boolean | undefined;
  readonly onChange: (value: string | undefined) => void;
  readonly testId: string;
}

/**
 * Picks an IANA time zone, offering whatever the runtime knows plus whatever is already stored.
 *
 * Unexported, like `TimeSelect` is to the availability editor, so its shape stays free to change.
 * @param props - Label, current value, and change handler.
 * @returns The time zone field.
 */
export function TimezoneSelect(props: TimezoneSelectProps): JSX.Element {
  const { label, description, value, placeholder, error, disabled, onChange, testId } = props;

  // A stored zone the runtime does not list still has to be selectable, so it is folded into the options
  // rather than dropped, which would silently rewrite the value on the next save.
  const options = useMemo(() => getTimezoneOptions([value]), [value]);

  return (
    <Select
      label={label}
      description={description}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      data={options}
      value={value ?? null}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      onChange={(next) => onChange(next ?? undefined)}
      searchable
      clearable
      nothingFoundMessage="No matching time zone"
      data-testid={testId}
    />
  );
}
