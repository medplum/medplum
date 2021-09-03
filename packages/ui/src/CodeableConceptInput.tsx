import { CodeableConcept, ElementDefinition, stringify, ValueSet, ValueSetContains, ValueSetExpansion } from '@medplum/core';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { useMedplum } from './MedplumProvider';

export interface CodeableConceptInputProps {
  property: ElementDefinition;
  name: string;
  defaultValue?: CodeableConcept;
}

export function CodeableConceptInput(props: CodeableConceptInputProps) {
  const medplum = useMedplum();

  let defaultValue = undefined;
  if (props.defaultValue) {
    defaultValue = [props.defaultValue];
  }

  return (
    <Autocomplete
      loadOptions={(input: string): Promise<CodeableConcept[]> => {
        const system = props.property.binding?.valueSet as string;
        return medplum.searchValueSet(system, input)
          .then((valueSet: ValueSet) => {
            return ((valueSet.expansion as ValueSetExpansion).contains as ValueSetContains[]).map(valueSetElementToCodeableConcept);
          });
      }}
      buildUnstructured={buildUnstructured}
      getId={getId}
      getDisplay={getDisplay}
      name={props.name}
      defaultValue={defaultValue}
    />
  );
}

function valueSetElementToCodeableConcept(element: ValueSetContains): CodeableConcept {
  return {
    text: element.display,
    coding: [{
      system: element.system,
      code: element.code,
      display: element.display
    }]
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
