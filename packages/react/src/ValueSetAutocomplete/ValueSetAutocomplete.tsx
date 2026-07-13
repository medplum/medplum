// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import type { ValueSetExpandParams } from '@medplum/core';
import type { ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { forwardRef, useCallback } from 'react';
import type { AsyncAutocompleteOption, AsyncAutocompleteProps } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete';
import { isValueSetUnavailable, useValueSetAvailability } from './valueSetAvailability';

export interface ValueSetAutocompleteProps extends Omit<
  AsyncAutocompleteProps<ValueSetExpansionContains>,
  'loadOptions' | 'toKey' | 'toOption'
> {
  readonly binding: string | undefined;
  readonly creatable?: boolean;
  readonly clearable?: boolean;
  readonly expandParams?: Partial<ValueSetExpandParams>;
  readonly withHelpText?: boolean;
}

function toKey(element: ValueSetExpansionContains): string {
  if (typeof element.code === 'string') {
    return element.code;
  }
  return JSON.stringify(element);
}

function getDisplay(item: ValueSetExpansionContains): string {
  if (typeof item.display === 'string') {
    return item.display;
  }
  return toKey(item);
}

function toOption(element: ValueSetExpansionContains): AsyncAutocompleteOption<ValueSetExpansionContains> {
  return {
    value: toKey(element),
    label: getDisplay(element),
    resource: element,
  };
}

function createValue(input: string): ValueSetExpansionContains {
  return {
    code: input,
    display: input,
  };
}

/**
 * A low-level component to autocomplete based on a FHIR Valueset.
 * This is the base component for CodeableConceptInput, CodingInput, and CodeInput.
 * @param props - The ValueSetAutocomplete React props.
 * @returns The ValueSetAutocomplete React node.
 */
export function ValueSetAutocomplete(props: ValueSetAutocompleteProps): JSX.Element {
  const medplum = useMedplum();
  const { binding, creatable, clearable, expandParams, withHelpText, error, description, ...rest } = props;
  const availability = useValueSetAvailability(binding);
  const isCreatable = creatable ?? true;

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<ValueSetExpansionContains[]> => {
      if (!binding || isValueSetUnavailable(medplum, binding)) {
        return [];
      }
      // Search errors surface inline and retry, but never latch the shared availability
      // cache: a 400 here can be filter-specific (e.g. an unsupported filter expression),
      // so only the filter-free mount probe is allowed to classify a value set as missing
      const valueSet: ValueSet = await medplum.valueSetExpand(
        {
          count: 10,
          ...expandParams,
          url: binding,
          filter: input,
        },
        { signal }
      );
      const valueSetElements = valueSet.expansion?.contains ?? [];
      const newData: ValueSetExpansionContains[] = [];
      for (const valueSetElement of valueSetElements) {
        if (valueSetElement.code && !newData.some((item) => item.code === valueSetElement.code)) {
          newData.push(valueSetElement);
        }
      }

      return newData;
    },
    [medplum, expandParams, binding]
  );

  // An unavailable value set degrades the field by severity: if manual entry is allowed the field
  // stays usable with quiet helper text, otherwise it is truly unusable and gets disabled
  let inputDescription: ReactNode = description;
  let inputError: ReactNode = error;
  let inputDisabled = rest.disabled;
  let inputWrapperOrder: ('label' | 'input' | 'description' | 'error')[] | undefined;
  if (availability.status === 'unavailable') {
    if (isCreatable) {
      const unavailableNote = (
        <UnavailableNote text="Suggestions unavailable" color="yellow.9" message={availability.message} />
      );
      inputDescription = description ? (
        <>
          {description}
          <br />
          {unavailableNote}
        </>
      ) : (
        unavailableNote
      );
      // Render the warning below the input, where errors also appear, rather than
      // Mantine's default above-the-input description slot
      inputWrapperOrder = ['label', 'input', 'description', 'error'];
    } else {
      // The unavailable explanation always renders — it is the reason the field is disabled —
      // alongside any consumer-supplied validation error
      const unavailableNote = (
        <UnavailableNote text="This field is unavailable." color="red" message={availability.message} />
      );
      inputError = error ? (
        <>
          {error}
          <br />
          {unavailableNote}
        </>
      ) : (
        unavailableNote
      );
      inputDisabled = true;
    }
  }

  return (
    <AsyncAutocomplete
      {...rest}
      description={inputDescription}
      error={inputError}
      disabled={inputDisabled}
      inputWrapperOrder={inputWrapperOrder}
      creatable={isCreatable}
      clearable={clearable ?? true}
      toOption={toOption}
      loadOptions={loadValues}
      onCreate={createValue}
      itemComponent={withHelpText ? ItemComponent : undefined}
    />
  );
}

export interface UnavailableNoteProps {
  readonly text: string;
  readonly color: string;
  readonly message: string;
}

export function UnavailableNote({ text, color, message }: UnavailableNoteProps): JSX.Element {
  return (
    <Text span size="xs" c={color}>
      {text}
      <Tooltip label={message} position="top-start" withArrow events={{ hover: true, focus: true, touch: true }}>
        <ActionIcon
          variant="subtle"
          color={color}
          size={16}
          ml={4}
          aria-label={`Why is this unavailable? ${message}`}
          style={{ verticalAlign: 'text-bottom' }}
        >
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Text>
  );
}

const ItemComponent = forwardRef<HTMLDivElement, AsyncAutocompleteOption<ValueSetExpansionContains>>(
  ({ label, resource, active, ...others }: AsyncAutocompleteOption<ValueSetExpansionContains>, ref) => {
    return (
      <div ref={ref} {...others}>
        <Group wrap="nowrap" gap="xs">
          {active && <IconCheck size={12} />}
          <div>
            <Text>{label}</Text>
            <Text size="xs" c="dimmed">
              {`${resource.system}#${resource.code}`}
            </Text>
          </div>
        </Group>
      </div>
    );
  }
);
