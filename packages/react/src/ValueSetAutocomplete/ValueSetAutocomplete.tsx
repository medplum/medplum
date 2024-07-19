import { Group, Text } from '@mantine/core';
import { ValueSetExpandParams } from '@medplum/core';
import { ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { forwardRef, useCallback } from 'react';
import {
  AsyncAutocomplete,
  AsyncAutocompleteOption,
  AsyncAutocompleteProps,
} from '../AsyncAutocomplete/AsyncAutocomplete';
import { IconCheck } from '@tabler/icons-react';

export interface ValueSetAutocompleteProps
  extends Omit<AsyncAutocompleteProps<ValueSetExpansionContains>, 'loadOptions' | 'toKey' | 'toOption'> {
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
  const { binding, creatable, clearable, expandParams, withHelpText, ...rest } = props;

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<ValueSetExpansionContains[]> => {
      if (!binding) {
        return [];
      }
      const valueSet = await medplum.valueSetExpand(
        {
          ...expandParams,
          url: binding,
          filter: input,
        },
        { signal }
      );
      const valueSetElements = valueSet.expansion?.contains as ValueSetExpansionContains[];
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

  return (
    <AsyncAutocomplete
      {...rest}
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
