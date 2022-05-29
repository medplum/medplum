import { getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import React from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { DescriptionList, DescriptionListEntry } from './DescriptionList';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';

export interface BackboneElementDisplayProps {
  schema: IndexedStructureDefinition;
  typeName: string;
  value?: any;
  compact?: boolean;
  ignoreMissingValues?: boolean;
  link?: boolean;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps): JSX.Element | null {
  const value = props.value;
  if (!value) {
    return null;
  }

  const typeName = props.typeName;
  const typeSchema = props.schema.types[typeName];
  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
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
        const [propertyValue, propertyType] = getValueAndType(value, property);
        if (
          props.ignoreMissingValues &&
          (!propertyValue || (Array.isArray(propertyValue) && propertyValue.length === 0))
        ) {
          return null;
        }
        return (
          <DescriptionListEntry key={key} term={getPropertyDisplayName(property)}>
            <ResourcePropertyDisplay
              schema={props.schema}
              property={property}
              propertyType={propertyType}
              value={propertyValue}
              ignoreMissingValues={props.ignoreMissingValues}
              link={props.link}
            />
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
