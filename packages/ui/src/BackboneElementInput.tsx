import { PropertySchema } from '@medplum/core';
import React, { useState } from 'react';
import { FormSection } from './FormSection';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface BackboneElementInputProps {
  property: PropertySchema;
  name: string;
  value?: any;
}

export function BackboneElementInput(props: BackboneElementInputProps) {
  const [value, setValue] = useState(props.value);
  // const typeSchema = props.backboneType;
  const typeSchema = {
    properties: [] as PropertySchema[]
  };
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
