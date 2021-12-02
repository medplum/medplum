import { buildTypeName, ElementDefinition, getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import React from 'react';
import { FormSection } from './FormSection';
import { DEFAULT_IGNORED_PROPERTIES } from './ResourceForm';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface BackboneElementInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultValue?: any;
  onChange?: (value: any) => void;
}

export function BackboneElementInput(props: BackboneElementInputProps) {
  const typeName = buildTypeName(props.property.path?.split('.') as string[]);
  const typeSchema = props.schema.types[typeName];
  if (!typeSchema) {
    return <div>Schema not found</div>
  }

  return (
    <>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        return (
          <FormSection key={key} title={getPropertyDisplayName(property)} description={property.definition}>
            <ResourcePropertyInput
              schema={props.schema}
              property={property}
              name={props.name + '.' + key}
              defaultValue={props.defaultValue?.[key]}
            />
          </FormSection>
        );
      })}
    </>
  );
}
