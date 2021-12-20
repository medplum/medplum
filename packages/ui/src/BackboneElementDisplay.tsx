import { getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import { evalFhirPath } from '@medplum/fhirpath';
import React from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { DescriptionList, DescriptionListEntry } from './DescriptionList';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

export interface BackboneElementDisplayProps {
  schema: IndexedStructureDefinition;
  typeName: string;
  value?: any;
  compact?: boolean;
  ignoreMissingValues?: boolean;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps) {
  const value = props.value;
  if (!value) {
    return null;
  }

  const typeName = props.typeName;
  const typeSchema = props.schema.types[typeName];
  if (!typeSchema) {
    return <div>Schema not found</div>;
  }

  if (typeof value === 'object' && 'name' in value && Object.keys(value).length === 1) {
    // Special case for common BackboneElement pattern
    // Where there is an object with a single property 'name'
    // Just display the name value.
    return <div>{value.name}</div>;
  }

  return (
    <DescriptionList compact={props.compact}>
      {Object.entries(typeSchema.properties).map((entry) => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        let propertyValue: any = evalFhirPath(key, value);
        // FHIRPath will always return an array
        // If the property is not an array property,
        // then unrap the value.
        if (propertyValue.length === 0) {
          propertyValue = null;
        } else if (property.max !== '*') {
          propertyValue = propertyValue[0];
        }
        if (props.ignoreMissingValues && !propertyValue) {
          return null;
        }
        return (
          <DescriptionListEntry key={key} term={getPropertyDisplayName(property)}>
            <ResourcePropertyDisplay
              schema={props.schema}
              property={property}
              value={propertyValue}
              ignoreMissingValues={props.ignoreMissingValues}
            />
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
