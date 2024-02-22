import { getPathDisplayName, isEmpty, tryGetDataType, TypedValue } from '@medplum/core';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { DescriptionList, DescriptionListEntry } from '../DescriptionList/DescriptionList';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { useMemo } from 'react';

const EXTENSION_KEYS = new Set(['extension', 'modifierExtension']);
const IGNORED_PROPERTIES = new Set(['id', ...DEFAULT_IGNORED_PROPERTIES].filter((prop) => !EXTENSION_KEYS.has(prop)));

export interface BackboneElementDisplayProps {
  readonly value: TypedValue;
  readonly compact?: boolean;
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
  /** (optional) Profile URL of the structure definition represented by the backbone element */
  readonly profileUrl?: string;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps): JSX.Element | null {
  const typedValue = props.value;
  const { value, type: typeName } = typedValue;
  const typeSchema = useMemo(() => tryGetDataType(typeName, props.profileUrl), [props.profileUrl, typeName]);

  if (isEmpty(value)) {
    return null;
  }

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
      {Object.entries(typeSchema.elements).map(([key, property]) => {
        if (EXTENSION_KEYS.has(key) && isEmpty(property.slicing?.slices)) {
          // an extension property without slices has no nested extensions
          return null;
        } else if (IGNORED_PROPERTIES.has(key)) {
          return null;
        } else if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && property.path.split('.').length === 2) {
          return null;
        }

        // Profiles can include nested elements in addition to their containing element, e.g.:
        // identifier, identifier.use, identifier.system
        // Skip nested elements, e.g. identifier.use, since they are handled by the containing element
        if (key.includes('.')) {
          return false;
        }

        const [propertyValue, propertyType] = getValueAndType(typedValue, key);
        if (props.ignoreMissingValues && isEmpty(propertyValue)) {
          return null;
        }

        return (
          <DescriptionListEntry key={key} term={getPathDisplayName(key)}>
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
