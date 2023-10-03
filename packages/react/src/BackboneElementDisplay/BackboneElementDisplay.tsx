import { getPropertyDisplayName, tryGetDataType, TypedValue } from '@medplum/core';
import React from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { DescriptionList, DescriptionListEntry } from '../DescriptionList/DescriptionList';
import { getValueAndType, ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

export interface BackboneElementDisplayProps {
  value: TypedValue;
  compact?: boolean;
  ignoreMissingValues?: boolean;
  link?: boolean;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps): JSX.Element | null {
  const typedValue = props.value;
  const value = typedValue.value;
  if (!value) {
    return null;
  }

  const typeName = typedValue.type;
  const typeSchema = tryGetDataType(typeName);
  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  if (
    typeof value === 'object' &&
    'name' in value &&
    Object.keys(value).length === 1 &&
    typeof value.name === 'string'
  ) {
    // Special case for common BackboneElement pattern
    // Where there is an object with a single property 'name'
    // Just display the name value.
    return <div>{value.name}</div>;
  }

  return (
    <DescriptionList compact={props.compact}>
      {Object.entries(typeSchema.elements).map((entry) => {
        const [key, property] = entry;
        if (DEFAULT_IGNORED_PROPERTIES.includes(key)) {
          return null;
        }
        // if (!property.path) {
        //   property.path = typeName + '.' + key;
        // }
        const [propertyValue, propertyType] = getValueAndType(typedValue, key);
        if (
          props.ignoreMissingValues &&
          (!propertyValue || (Array.isArray(propertyValue) && propertyValue.length === 0))
        ) {
          return null;
        }
        return (
          <DescriptionListEntry key={key} term={getPropertyDisplayName(key)}>
            <ResourcePropertyDisplay
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
