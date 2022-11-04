import { MultiSelect } from '@mantine/core';
import { ElementDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

export interface ValueSetAutocompleteProps {
  property: ElementDefinition;
  name: string;
  placeholder?: string;
  defaultValue?: ValueSetExpansionContains;
  onChange?: (value: ValueSetExpansionContains | undefined) => void;
}

interface ValueSetAutocompleteItem {
  value: string;
  label: string;
  element: ValueSetExpansionContains;
}

function valueSetElementToAutocompleteItem(element: ValueSetExpansionContains): ValueSetAutocompleteItem {
  return {
    value: element.code as string,
    label: getDisplay(element),
    element,
  };
}

export function ValueSetAutocomplete(props: ValueSetAutocompleteProps): JSX.Element {
  const medplum = useMedplum();
  const { property, defaultValue } = props;
  const [textValues, setTextValues] = useState<string[]>(defaultValue?.code ? [defaultValue.code as string] : []);

  const [data, setData] = useState<ValueSetAutocompleteItem[]>(
    defaultValue?.code ? [valueSetElementToAutocompleteItem(defaultValue)] : []
  );

  const dataRef = useRef<ValueSetAutocompleteItem[]>();
  dataRef.current = data;

  const loadValues = useCallback(
    async (input: string): Promise<void> => {
      const system = property.binding?.valueSet as string;
      const valueSet = await medplum.searchValueSet(system, input);
      const valueSetElements = valueSet.expansion?.contains as ValueSetExpansionContains[];
      const newData = [...(dataRef.current as ValueSetAutocompleteItem[])];

      for (const valueSetElement of valueSetElements) {
        if (valueSetElement.code && !newData.some((item) => item.value === valueSetElement.code)) {
          newData.push(valueSetElementToAutocompleteItem(valueSetElement));
        }
      }

      setData(newData);
    },
    [medplum, property, dataRef]
  );

  function handleChange(values: string[]): void {
    setTextValues(values);

    const textValue = values[0];
    let currentItem = undefined;
    if (textValue) {
      currentItem = (dataRef.current as ValueSetAutocompleteItem[]).find((item) => item.value === values[0]);
      if (!currentItem) {
        const newElement = { code: textValue, display: textValue };
        currentItem = valueSetElementToAutocompleteItem(newElement);
        setData([...(dataRef.current as ValueSetAutocompleteItem[]), currentItem]);
      }
    }

    if (props.onChange) {
      props.onChange(currentItem?.element);
    }
  }

  useEffect(() => {
    loadValues('').catch(console.log);
  }, [loadValues]);

  return (
    <MultiSelect
      data={data}
      placeholder={props.placeholder}
      searchable
      creatable
      clearable
      value={textValues}
      filter={(value: string, selected: boolean, item: ValueSetAutocompleteItem) =>
        !!(
          textValues.length === 0 &&
          !selected &&
          (item.element.display?.toLowerCase().includes(value.toLowerCase().trim()) ||
            item.element.code?.toLowerCase().includes(value.toLowerCase().trim()))
        )
      }
      onChange={handleChange}
      getCreateLabel={(query) => `+ Create ${query}`}
      onCreate={(query) => valueSetElementToAutocompleteItem({ code: query, display: query })}
    />
  );
}

function getDisplay(item: ValueSetExpansionContains): string {
  return item.display || item.code || '';
}
