import { stringify } from '@medplum/core';
import {
  CodeableConcept,
  ElementDefinition,
  ValueSet,
  ValueSetExpansion,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { useMedplum } from './MedplumProvider';

export interface CodeableConceptInputProps {
  property: ElementDefinition;
  name: string;
  defaultValue?: CodeableConcept;
  onChange?: (value: CodeableConcept) => void;
}

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const medplum = useMedplum();

  let defaultValue = undefined;
  if (props.defaultValue) {
    defaultValue = [props.defaultValue];
  }

  return (
    <Autocomplete
      loadOptions={(input: string): Promise<CodeableConcept[]> => {
        const system = props.property.binding?.valueSet as string;
        return medplum.searchValueSet(system, input).then((valueSet: ValueSet) => {
          return ((valueSet.expansion as ValueSetExpansion).contains as ValueSetExpansionContains[]).map(
            valueSetElementToCodeableConcept
          );
        });
      }}
      buildUnstructured={buildUnstructured}
      getId={getId}
      getDisplay={getDisplay}
      name={props.name}
      defaultValue={defaultValue}
      loadOnFocus={true}
      onChange={(values: CodeableConcept[]) => {
        if (props.onChange) {
          props.onChange(values[0]);
        }
      }}
    />
  );
}

function valueSetElementToCodeableConcept(element: ValueSetExpansionContains): CodeableConcept {
  return {
    text: element.display,
    coding: [
      {
        system: element.system,
        code: element.code,
        display: element.display,
      },
    ],
  };
}

function buildUnstructured(str: string): CodeableConcept {
  return { text: str };
}

function getId(concept: CodeableConcept): string {
  if (concept.coding && concept.coding.length > 0) {
    return concept.coding[0].code as string;
  }
  return stringify(concept);
}

function getDisplay(concept: CodeableConcept): JSX.Element {
  const text = concept.coding?.[0]?.display ?? concept.coding?.[0]?.code ?? concept.text;
  return <>{text}</>;
}
