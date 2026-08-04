// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Text } from '@mantine/core';
import type { ValueSetExpandParams } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum, useValueSetAvailability } from '@medplum/react-hooks';
import { IconCheck } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { forwardRef, useCallback, useState } from 'react';
import type { AsyncAutocompleteOption, AsyncAutocompleteProps } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete';
import { UnavailableNote } from '../UnavailableNote/UnavailableNote';

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
  const isCreatable = creatable ?? true;
  const isUnavailable = useValueSetAvailability(binding) === false;
  const [searchError, setSearchError] = useState<string>();

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<ValueSetExpansionContains[]> => {
      if (!binding || isUnavailable) {
        return [];
      }
      try {
        const valueSet: ValueSet = await medplum.valueSetExpand(
          {
            count: 10,
            ...expandParams,
            url: binding,
            filter: input,
          },
          { signal }
        );
        setSearchError(undefined);
        const valueSetElements = valueSet.expansion?.contains ?? [];
        const newData: ValueSetExpansionContains[] = [];
        for (const valueSetElement of valueSetElements) {
          if (valueSetElement.code && !newData.some((item) => item.code === valueSetElement.code)) {
            newData.push(valueSetElement);
          }
        }
        return newData;
      } catch (err) {
        // Surface the failure inline (below) and swallow it, so the shared AsyncAutocomplete does
        // not also raise a toast. A search 400 is never treated as "value set missing" - that
        // verdict comes only from the filter-free mount probe in useValueSetAvailability.
        const message = normalizeErrorString(err);
        if (!(signal.aborted || message.includes('aborted'))) {
          setSearchError(message);
        }
        return [];
      }
    },
    [medplum, expandParams, binding, isUnavailable]
  );

  // An unavailable value set degrades the field by severity: if manual entry is allowed the field
  // stays usable with a quiet helper note, otherwise it is truly unusable and gets disabled.
  let inputDescription: ReactNode = description;
  let inputError: ReactNode = error;
  let inputDisabled = rest.disabled;
  if (isUnavailable) {
    const unavailableMessage = `Value set ${binding} is unavailable`;
    if (isCreatable) {
      // The field is still usable, so show a non-error helper note (in the description slot)
      const unavailableNote = (
        <UnavailableNote text="Suggestions unavailable" color="yellow.9" message={unavailableMessage} />
      );
      inputDescription = combineNodes(description, unavailableNote);
    } else {
      // The field is unusable: disable it and explain why alongside any consumer validation error
      const unavailableNote = (
        <UnavailableNote text="This field is unavailable." color="red" message={unavailableMessage} />
      );
      inputError = combineNodes(error, unavailableNote);
      inputDisabled = true;
    }
  } else if (searchError) {
    // A transient search failure shows inline, below the input, alongside any validation error
    inputError = combineNodes(error, searchError);
  }

  return (
    <AsyncAutocomplete
      {...rest}
      description={inputDescription}
      error={inputError}
      disabled={inputDisabled}
      creatable={isCreatable}
      clearable={clearable ?? true}
      toOption={toOption}
      loadOptions={loadValues}
      onCreate={createValue}
      itemComponent={withHelpText ? ItemComponent : undefined}
    />
  );
}

/**
 * Stacks two pieces of field text, dropping either if absent. The second node is a block-level
 * `span` with a top margin so it always starts on its own line and stays visually separated even
 * when the first node's text wraps — with no extra spacing when only one node is present. A `span`
 * (rather than a `div`/`Stack`) keeps this valid inside Mantine's description/error slots, which
 * render as a `<p>` and cannot legally contain block elements.
 * @param first - The first node (e.g. a consumer-supplied error or description).
 * @param second - The second node (e.g. the unavailable/search-error note).
 * @returns Both nodes stacked with spacing, or whichever one is present.
 */
function combineNodes(first: ReactNode, second: ReactNode): ReactNode {
  if (first && second) {
    return (
      <>
        {first}
        <Box component="span" display="block" mt="xs">
          {second}
        </Box>
      </>
    );
  }
  return first || second;
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
