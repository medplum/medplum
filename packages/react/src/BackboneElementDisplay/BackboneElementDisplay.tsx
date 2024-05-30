import {
  buildElementsContext,
  ElementsContextType,
  getPathDisplayName,
  isEmpty,
  tryGetDataType,
  TypedValue,
} from '@medplum/core';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { DescriptionList, DescriptionListEntry } from '../DescriptionList/DescriptionList';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { useContext, useMemo } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { AccessPolicyResource } from '@medplum/fhirtypes';

const EXTENSION_KEYS = ['extension', 'modifierExtension'];
const IGNORED_PROPERTIES = DEFAULT_IGNORED_PROPERTIES.filter((prop) => !EXTENSION_KEYS.includes(prop));

export interface BackboneElementDisplayProps {
  readonly value: TypedValue;
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  readonly compact?: boolean;
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
  /** (optional) Profile URL of the structure definition represented by the backbone element */
  readonly profileUrl?: string;
  /**
   * (optional) If provided, inputs specified in `accessPolicyResource.hiddenFields` are not shown.
   */
  readonly accessPolicyResource?: AccessPolicyResource;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps): JSX.Element | null {
  const typedValue = props.value;
  const { value, type: typeName } = typedValue;
  const parentElementsContext = useContext(ElementsContext);
  const profileUrl = props.profileUrl ?? parentElementsContext?.profileUrl;
  const typeSchema = useMemo(() => tryGetDataType(typeName, profileUrl), [profileUrl, typeName]);

  const newElementsContext: ElementsContextType | undefined = useMemo(() => {
    if (!typeSchema) {
      return undefined;
    }
    return buildElementsContext({
      parentContext: parentElementsContext,
      elements: typeSchema.elements,
      path: props.path,
      profileUrl: typeSchema.url,
      accessPolicyResource: props.accessPolicyResource,
    });
  }, [typeSchema, parentElementsContext, props.path, props.accessPolicyResource]);

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

  // Since this component may create a new ElementsContext, compute the effective context for use in this component
  const elementsContext = newElementsContext ?? parentElementsContext;

  return maybeWrapWithContext(
    ElementsContext.Provider,
    newElementsContext,
    <DescriptionList compact={props.compact}>
      {Object.entries(elementsContext.elements).map(([key, property]) => {
        if (EXTENSION_KEYS.includes(key) && isEmpty(property.slicing?.slices)) {
          // an extension property without slices has no nested extensions
          return null;
        } else if (IGNORED_PROPERTIES.includes(key)) {
          return null;
        } else if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && property.path.split('.').length === 2) {
          return null;
        }

        // Profiles can include nested elements in addition to their containing element, e.g.:
        // identifier, identifier.use, identifier.system
        // Skip nested elements, e.g. identifier.use, since they are handled by the containing element
        if (key.includes('.')) {
          return null;
        }

        const [propertyValue, propertyType] = getValueAndType(typedValue, key, elementsContext.profileUrl);
        if ((props.ignoreMissingValues || property.max === 0) && isEmpty(propertyValue)) {
          return null;
        }

        if (props.path.endsWith('.extension') && (key === 'url' || key === 'id')) {
          return null;
        }

        // Array values provide their own DescriptionListEntry wrapper(s)
        const isArrayProperty = property.max > 1 || property.isArray;
        const resourcePropertyDisplay = (
          <ResourcePropertyDisplay
            key={key}
            property={property}
            propertyType={propertyType}
            path={props.path + '.' + key}
            value={propertyValue}
            ignoreMissingValues={props.ignoreMissingValues}
            includeArrayDescriptionListEntry={isArrayProperty}
            link={props.link}
          />
        );

        if (isArrayProperty) {
          return resourcePropertyDisplay;
        }

        return (
          <DescriptionListEntry key={key} term={getPathDisplayName(key)}>
            {resourcePropertyDisplay}
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
