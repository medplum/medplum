// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import type { ValueSetExpandParams } from '@medplum/core';
import { getStatus, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { forwardRef, useCallback, useState } from 'react';
import type { AsyncAutocompleteOption, AsyncAutocompleteProps } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete';

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
  const { binding, creatable, clearable, expandParams, withHelpText, error, ...rest } = props;
  const [unavailableBinding, setUnavailableBinding] = useState<{ binding: string; message: string }>();
  const bindingError = binding && unavailableBinding?.binding === binding ? unavailableBinding.message : undefined;

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<ValueSetExpansionContains[]> => {
      if (!binding || unavailableBinding?.binding === binding) {
        return [];
      }
      let valueSet: ValueSet;
      try {
        valueSet = await medplum.valueSetExpand(
          {
            count: 10,
            ...expandParams,
            url: binding,
            filter: input,
          },
          { signal }
        );
      } catch (err) {
        // A 400/404 outcome (e.g. "ValueSet not found") won't succeed on retry, so remember the failure
        // and show it inline instead of surfacing an error on every keystroke; potentially transient
        // errors (429 rate limit, 401, 5xx, network) rethrow so the field keeps retrying
        const status = err instanceof OperationOutcomeError ? getStatus(err.outcome) : undefined;
        if (status === 400 || status === 404) {
          setUnavailableBinding({ binding, message: normalizeErrorString(err) });
          return [];
        }
        throw err;
      }
      const valueSetElements = valueSet.expansion?.contains ?? [];
      const newData: ValueSetExpansionContains[] = [];
      for (const valueSetElement of valueSetElements) {
        if (valueSetElement.code && !newData.some((item) => item.code === valueSetElement.code)) {
          newData.push(valueSetElement);
        }
      }

      return newData;
    },
    [medplum, expandParams, binding, unavailableBinding]
  );

  return (
    <AsyncAutocomplete
      {...rest}
      error={error ?? bindingError}
      creatable={creatable ?? true}
      clearable={clearable ?? true}
      toOption={toOption}
      loadOptions={loadValues}
      onCreate={createValue}
      itemComponent={withHelpText ? ItemComponent : undefined}
    />
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
