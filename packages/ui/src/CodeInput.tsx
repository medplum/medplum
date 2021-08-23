import { Coding, ElementDefinition, ValueSet, ValueSetContains, ValueSetExpansion } from '@medplum/core';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { useMedplum } from './MedplumProvider';

export interface CodeInputProps {
  property: ElementDefinition;
  name: string;
  defaultValue?: Coding | string;
}

export function CodeInput(props: CodeInputProps) {
  const medplum = useMedplum();

  let defaultValue = undefined;
  if (props.defaultValue) {
    if (typeof props.defaultValue === 'string') {
      defaultValue = [{ code: props.defaultValue }];
    } else {
      defaultValue = [props.defaultValue];
    }
  }

  return (
    <Autocomplete
      loadOptions={(input: string): Promise<Coding[]> => {
        const system = props.property.binding?.valueSet as string;
        const url = `fhir/R4/ValueSet/$expand?url=${encodeURIComponent(system)}&filter=${encodeURIComponent(input)}`;
        return medplum.get(url)
          .then((valueSet: ValueSet) => {
            return ((valueSet.expansion as ValueSetExpansion).contains as ValueSetContains[]).map(e => ({
              system: e.system,
              code: e.code,
              display: e.display
            } as Coding));
          });
      }}
      getId={(item: Coding) => item.code as string}
      getDisplay={(item: Coding) => <>{item.display || item.code}</>}
      name={props.name}
      defaultValue={defaultValue}
    />
  );
}
