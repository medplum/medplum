import { Stack } from '@mantine/core';
import { InternalSchemaElement, TypedValue, getPathDisplayName } from '@medplum/core';
import { useContext, useMemo, useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndTypeFromElement } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { OperationOutcome } from '@medplum/fhirtypes';
import { BackboneElementContext, splitRight } from '../BackboneElementInput/BackbonElementInput.utils';

const EXTENSION_KEYS = ['extension', 'modifierExtension'];

export interface ElementsInputProps {
  type: string | undefined;
  elements: { [key: string]: InternalSchemaElement };
  defaultValue: any;
  outcome: OperationOutcome | undefined;
  onChange: ((value: any) => void) | undefined;
}

export function ElementsInput(props: ElementsInputProps): JSX.Element {
  const { elements } = props;
  const [value, setValue] = useState<any>(props.defaultValue ?? {});
  const { seenKeys } = useContext(BackboneElementContext);

  const fixedProperties = useMemo(() => {
    const result: { [key: string]: InternalSchemaElement & { fixed: TypedValue } } = Object.create(null);
    for (const [key, property] of Object.entries(elements)) {
      if (property.fixed) {
        result[key] = property as any;
      }
    }
    return result;
  }, [elements]);

  function setValueWrapper(newValue: any): void {
    for (const [key, prop] of Object.entries(fixedProperties)) {
      setPropertyValue(newValue, key, key, prop, prop.fixed.value);
    }
    console.log('ElementsInput', newValue);
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Stack style={{ flexGrow: 1 }}>
      {Object.entries(elements).map(([key, element]) => {
        if (!element.type) {
          return null;
        }

        if (element.max === 0) {
          return null;
        }

        // Mostly want this Extension.url, but not displaying any fixed element seems like the correct behavior
        if (element.fixed) {
          return null;
        }

        if (EXTENSION_KEYS.includes(key)) {
          // TODO{mattlong} verify the following comment is accurate
          // an extension property without slices has no sub-extensions and can safely be skipped
          if (!element.slicing || element.slicing.slices.length === 0) {
            return null;
          }
        } else if (key === 'id' || DEFAULT_IGNORED_PROPERTIES.includes(key)) {
          return null;
        } else if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && element.path.split('.').length === 2) {
          return null;
        }

        // Profiles include definitions for nested properties that they have modified in some way
        // (e.g. restricting cardinality, specifying pattern[x], etc.
        // Do not render nested elements directly since that would result in them being displayed twice.
        const [beginning, _last] = splitRight(key, '.');
        if (seenKeys.has(beginning)) {
          // TODO {mattlong} walkedElements entries need to be used as nested elements
          // are rendered to overwrite their (default) InternalSchemaElement
          return null;
        }

        const [propertyValue, propertyType] = getValueAndTypeFromElement(value, key, element);

        const required = element.min !== undefined && element.min > 0;

        const resourcePropertyInput = (
          <ResourcePropertyInput
            key={key}
            property={element}
            name={key}
            defaultValue={propertyValue}
            defaultPropertyType={propertyType}
            onChange={(newValue: any, propName?: string) => {
              console.debug('Backbone updating', propName, newValue);
              setValueWrapper(setPropertyValue({ ...value }, key, propName ?? key, element, newValue));
            }}
            arrayElement={undefined}
            outcome={props.outcome}
          />
        );

        // skip FormSection wrapper fo extensions
        if (props.type === 'Extension' || EXTENSION_KEYS.includes(key)) {
          return resourcePropertyInput;
        }

        if (element.type.length === 1 && element.type[0].code === 'boolean') {
          return (
            <CheckboxFormSection
              key={key}
              title={getPathDisplayName(key)}
              description={element.description}
              htmlFor={key}
              fhirPath={element.path}
              withAsterisk={required}
            >
              {resourcePropertyInput}
            </CheckboxFormSection>
          );
        }

        return (
          <FormSection
            key={key}
            title={getPathDisplayName(key)}
            description={element.description}
            withAsterisk={required}
            htmlFor={key}
            outcome={props.outcome}
            fhirPath={element.path}
          >
            {resourcePropertyInput}
          </FormSection>
        );
      })}
    </Stack>
  );
}
