import { buildTypeName, ElementDefinition, getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import React, { useState } from 'react';
import { FormSection } from './FormSection';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface BackboneElementInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultValue?: any;
}

export function BackboneElementInput(props: BackboneElementInputProps) {
  const [value, setValue] = useState(props.defaultValue);

  const typeName = buildTypeName(props.property.path?.split('.') as string[]);
  const typeSchema = props.schema.types[typeName];
  if (!typeSchema) {
    return <div>Schema not found</div>
  }

  return (
    <>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        const property = entry[1];
        return (
          <FormSection key={key} title={getPropertyDisplayName(property)} description={property.definition}>
            <ResourcePropertyInput
              schema={props.schema}
              property={property}
              name={props.name + '.' + key}
              defaultValue={value[key]}
            />
          </FormSection>
        );
      })}
    </>
  );
}
