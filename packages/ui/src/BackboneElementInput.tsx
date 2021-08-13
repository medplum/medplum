import { ElementDefinition, getPropertyDisplayName } from '@medplum/core';
import React, { useState } from 'react';
import { FormSection } from './FormSection';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface BackboneElementInputProps {
  property: ElementDefinition;
  name: string;
  value?: any;
}

export function BackboneElementInput(props: BackboneElementInputProps) {
  const [value, setValue] = useState(props.value);
  const typeSchema = {
    properties: [] as ElementDefinition[]
  };
  return (
    <>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        const property = entry[1];
        return (
          <FormSection key={key} title={getPropertyDisplayName(property)} description={property.definition}>
            <ResourcePropertyInput property={property} name={props.name + '.' + property.id} value={value[key]} />
          </FormSection>
        );
      })}
    </>
  );
}
