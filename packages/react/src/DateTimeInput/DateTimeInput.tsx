// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, TextInput } from '@mantine/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { IconCalendarEvent } from '@tabler/icons-react';
import type { ChangeEvent, FocusEvent, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { PrimitiveTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { getErrorsForInput } from '../utils/outcomes';
import classes from './DateTimeInput.module.css';
import { convertIsoToLocal, convertLocalToIso } from './DateTimeInput.utils';

export interface DateTimeInputProps extends PrimitiveTypeInputProps {
  readonly label?: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly autoFocus?: boolean;
  readonly outcome?: OperationOutcome;
  readonly onChange?: (value: string) => void;
}

/**
 * The DateTimeInput component is a wrapper around the HTML5 input type="datetime-local".
 * The main purpose is to reconcile time zones.
 * Most of our date/time values are in ISO-8601, which includes a time zone offset.
 * The datetime-local input does not support the time zone offset.
 * @param props - The Input props.
 * @returns The JSX element to render.
 */
export function DateTimeInput(props: DateTimeInputProps): JSX.Element {
  const defaultValue = convertIsoToLocal(props.defaultValue);
  const [empty, setEmpty] = useState(!defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      setEmpty(isEmpty(inputRef.current));
    }
  }, [defaultValue]);

  return (
    <TextInput
      ref={inputRef}
      id={props.name}
      name={props.name}
      label={props.label}
      data-autofocus={props.autoFocus}
      data-testid={props['data-testid'] ?? props.name}
      placeholder={props.placeholder}
      required={props.required}
      disabled={props.disabled}
      type={getInputType()}
      step={1}
      defaultValue={defaultValue}
      classNames={{ input: classes.input }}
      data-empty={empty || undefined}
      autoFocus={props.autoFocus}
      error={getErrorsForInput(props.outcome, props.name)}
      rightSection={
        <ActionIcon
          variant="transparent"
          color="gray"
          className={classes.pickerButton}
          aria-label="Open date picker"
          disabled={props.disabled}
          onClick={() => openPicker(inputRef.current)}
        >
          <IconCalendarEvent size={16} stroke={2} className={classes.pickerIcon} />
        </ActionIcon>
      }
      rightSectionPointerEvents="all"
      onBlur={(e: FocusEvent<HTMLInputElement>) => setEmpty(isEmpty(e.currentTarget))}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setEmpty(isEmpty(e.currentTarget));
        if (props.onChange) {
          const newValue = e.currentTarget.value;
          props.onChange(convertLocalToIso(newValue));
        }
      }}
    />
  );
}

function isEmpty(input: HTMLInputElement): boolean {
  return !input.value && !input.validity.badInput;
}

function openPicker(input: HTMLInputElement | null): void {
  try {
    input?.showPicker?.();
  } catch {
    // showPicker throws in cross-origin iframes
  }
}

/**
 * Returns the input type for the requested type.
 * JSDOM does not support many of the valid <input> type attributes.
 * For example, it won't fire change events for <input type="datetime-local">.
 * @returns The input type for the current environment.
 */
function getInputType(): string {
  return import.meta.env.NODE_ENV === 'test' ? 'text' : 'datetime-local';
}
