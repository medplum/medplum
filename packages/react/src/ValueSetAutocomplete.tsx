import { Autocomplete, Loader } from '@mantine/core';
import { ElementDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { useMedplum } from './MedplumProvider';

export interface ValueSetAutocompleteProps {
  property: ElementDefinition;
  name: string;
  placeholder?: string;
  defaultValue?: ValueSetExpansionContains;
  onChange?: (value: ValueSetExpansionContains) => void;
}

interface ValueSetAutocompleteItem {
  value: string;
  element: ValueSetExpansionContains;
}

export function ValueSetAutocomplete(props: ValueSetAutocompleteProps): JSX.Element {
  const medplum = useMedplum();
  const defaultValue = props.defaultValue;
  const [value, setValue] = useState<ValueSetExpansionContains | undefined>(defaultValue);
  const [text, setText] = useState<string>(defaultValue ? getDisplay(defaultValue) : '');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ValueSetAutocompleteItem[]>([]);

  async function loadValues(input: string): Promise<void> {
    setLoading(true);
    const system = props.property.binding?.valueSet as string;
    const valueSet = await medplum.searchValueSet(system, input);
    const valueSetElements = valueSet.expansion?.contains as ValueSetExpansionContains[];
    setData(valueSetElements.map((element) => ({ value: getDisplay(element), element })));
    setLoading(false);
  }

  async function handleChange(val: string): Promise<void> {
    setText(val);
    return loadValues(val);
  }

  function handleSelect(item: ValueSetAutocompleteItem): void {
    setValue(item.element);
    setText(item.value);
    setData([]);
    if (props.onChange) {
      props.onChange(item.element);
    }
  }

  function handleBlur(val: string): void {
    if (!value) {
      const unstructured: ValueSetExpansionContains = {
        display: val,
        code: val,
      };
      setValue(unstructured);
      if (props.onChange) {
        props.onChange(unstructured);
      }
    }
  }

  return (
    <Autocomplete
      value={text}
      data={data}
      placeholder={props.placeholder}
      onFocus={() => loadValues(text)}
      onBlur={() => handleBlur(text)}
      onChange={handleChange}
      onItemSubmit={handleSelect}
      rightSection={loading ? <Loader size={16} /> : null}
    />
  );
}

function getDisplay(item: ValueSetExpansionContains): string {
  return item.display || item.code || '';
}
