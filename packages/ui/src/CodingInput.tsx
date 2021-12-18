import { Coding, ElementDefinition, ValueSet, ValueSetExpansion, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { useMedplum } from './MedplumProvider';

export interface CodingInputProps {
  property: ElementDefinition;
  name: string;
  defaultValue?: Coding;
  onChange?: (value: Coding) => void;
}

export function CodingInput(props: CodingInputProps) {
  const medplum = useMedplum();

  let defaultValue = undefined;
  if (props.defaultValue) {
    defaultValue = [props.defaultValue];
  }

  return (
    <Autocomplete
      loadOptions={(input: string): Promise<Coding[]> => {
        const system = props.property.binding?.valueSet as string;
        return medplum.searchValueSet(system, input).then((valueSet: ValueSet) => {
          return ((valueSet.expansion as ValueSetExpansion).contains as ValueSetExpansionContains[]).map(
            (e) =>
              ({
                system: e.system,
                code: e.code,
                display: e.display,
              } as Coding)
          );
        });
      }}
      buildUnstructured={(str: string) => ({ code: str })}
      getId={(item: Coding) => item.code as string}
      getDisplay={(item: Coding) => <>{item.display || item.code}</>}
      name={props.name}
      defaultValue={defaultValue}
      onChange={(values: Coding[]) => {
        if (props.onChange) {
          props.onChange(values[0]);
        }
      }}
    />
  );
}
