import { ElementDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useCallback } from 'react';
import {
  AsyncAutocomplete,
  AsyncAutocompleteOption,
  AsyncAutocompleteProps,
} from '../AsyncAutocomplete/AsyncAutocomplete';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

export interface ValueSetAutocompleteProps
  extends Omit<AsyncAutocompleteProps<ValueSetExpansionContains>, 'loadOptions' | 'toKey' | 'toOption'> {
  elementDefinition: ElementDefinition;
  creatable?: boolean;
  clearable?: boolean;
}

function toKey(element: ValueSetExpansionContains): string {
  return element.code as string;
}

function toOption(element: ValueSetExpansionContains): AsyncAutocompleteOption<ValueSetExpansionContains> {
  return {
    value: element.code as string,
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
 */
export function ValueSetAutocomplete(props: ValueSetAutocompleteProps): JSX.Element {
  const medplum = useMedplum();
  const { elementDefinition, creatable, clearable, ...rest } = props;

  const loadValues = useCallback(
    async (input: string, signal: AbortSignal): Promise<ValueSetExpansionContains[]> => {
      if (!elementDefinition.binding) {
        return [];
      }
      const system = elementDefinition.binding?.valueSet as string;
      const valueSet = await medplum.searchValueSet(system, input, { signal });
      const valueSetElements = valueSet.expansion?.contains as ValueSetExpansionContains[];
      const newData: ValueSetExpansionContains[] = [];
      for (const valueSetElement of valueSetElements) {
        if (valueSetElement.code && !newData.some((item) => item.code === valueSetElement.code)) {
          newData.push(valueSetElement);
        }
      }

      return newData;
    },
    [medplum, elementDefinition]
  );

  return (
    <AsyncAutocomplete
      {...rest}
      creatable={creatable ?? true}
      clearable={clearable ?? true}
      toKey={toKey}
      toOption={toOption}
      loadOptions={loadValues}
      onCreate={createValue}
      getCreateLabel={creatable === false ? undefined : (query: any) => `+ Create ${query}`}
    />
  );
}

function getDisplay(item: ValueSetExpansionContains): string {
  return item.display || item.code || '';
}
