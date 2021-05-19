import React, { useState } from 'react';
import { PropertyDefinition, TypeDefinition } from 'medplum';
import { FormSection } from './FormSection';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface BackboneElementInputProps {
  property: PropertyDefinition;
  name: string;
  backboneType: TypeDefinition;
  value?: any;
}

export function BackboneElementInput(props: BackboneElementInputProps) {
  const [value, setValue] = useState(props.value);
  const typeSchema = props.backboneType;
  return (
    <>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        const property = entry[1];
        return (
          <FormSection key={key} title={property.display} description={property.description}>
            <ResourcePropertyInput property={property} name={props.name + '.' + property.key} value={value[key]} />
          </FormSection>
        );
      })}
    </>
  );
}
