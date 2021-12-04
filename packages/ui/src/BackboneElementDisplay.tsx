import { buildTypeName, ElementDefinition, getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import React from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { DescriptionList, DescriptionListEntry } from './DescriptionList';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

export interface BackboneElementDisplayProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  value?: any;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps) {
  const value = props.value;
  if (!value) {
    return null;
  }

  const typeName = buildTypeName(props.property.path?.split('.') as string[]);
  const typeSchema = props.schema.types[typeName];
  if (!typeSchema) {
    return <div>Schema not found</div>
  }

  return (
    <DescriptionList>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        return (
          <DescriptionListEntry key={key} term={getPropertyDisplayName(property)}>
            <ResourcePropertyDisplay
              schema={props.schema}
              property={property}
              value={value[key]}
            />
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
