import { ElementDefinition, ValueSet, ValueSetExpansion, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { useMedplum } from './MedplumProvider';

export interface CodeInputProps {
  property: ElementDefinition;
  name: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

const cachedDisplayValues: Record<string, string> = {};

export function CodeInput(props: CodeInputProps): JSX.Element {
  const medplum = useMedplum();

  let defaultValue = undefined;
  if (props.defaultValue) {
    defaultValue = [props.defaultValue];
  }

  return (
    <Autocomplete
      loadOptions={(input: string): Promise<string[]> => {
        const system = props.property.binding?.valueSet as string;
        return medplum.searchValueSet(system, input).then((valueSet: ValueSet) => {
          const contains = (valueSet.expansion as ValueSetExpansion).contains as ValueSetExpansionContains[];
          contains.forEach((e) => (cachedDisplayValues[e.code as string] = e.display as string));
          return contains.map((e) => e.code as string);
        });
      }}
      buildUnstructured={(str: string) => str}
      getId={(item: string) => item}
      getDisplay={(item: string) => <>{cachedDisplayValues[item] || item}</>}
      name={props.name}
      defaultValue={defaultValue}
      onChange={(values: string[]) => {
        if (props.onChange) {
          props.onChange(values[0]);
        }
      }}
    />
  );
}
