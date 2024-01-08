import { Stack } from '@mantine/core';
import { InternalSchemaElement, InternalTypeSchema, TypedValue, getPathDisplayName, isPopulated } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndTypeFromElement } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { ElementsContext, buildElementsContext } from './ElementsInput.utils';

const EXTENSION_KEYS = new Set(['extension', 'modifierExtension']);
const IGNORED_PROPERTIES = new Set(['id', ...DEFAULT_IGNORED_PROPERTIES].filter((prop) => !EXTENSION_KEYS.has(prop)));

export interface ElementsInputProps {
  type: string | undefined;
  path: string;
  elements: Record<string, InternalSchemaElement>;
  defaultValue: any;
  outcome: OperationOutcome | undefined;
  onChange: ((value: any) => void) | undefined;
  testId?: string;
  typeSchema: InternalTypeSchema | undefined;
}

export function ElementsInput(props: ElementsInputProps): JSX.Element {
  const [value, setValue] = useState<any>(props.defaultValue ?? {});
  // const DEBUG = useMemo(() => props.testId === 'slice-VSCat-elements-0', [props.testId]);
  // const DEBUG = useMemo(() => true || props.path === 'Patient.extension.extension', [props.path]);
  const parentElementsContextValue = useContext(ElementsContext);

  const elementsContextValue = useMemo(() => {
    return buildElementsContext({
      parentContext: parentElementsContextValue,
      elements: props.elements,
      parentPath: props.path,
      parentType: props.type,
    });
  }, [parentElementsContextValue, props.elements, props.path, props.type]);
  const elements = elementsContextValue.elements;

  const fixedProperties = useMemo(() => {
    const result: { [key: string]: InternalSchemaElement & { fixed: TypedValue } } = Object.create(null);
    for (const [key, property] of Object.entries(elements)) {
      if (property.fixed) {
        result[key] = property as any;
      }
    }
    return result;
  }, [elements]);

  const elementsToRender = useMemo(() => {
    const result = Object.entries(elements).filter(([key, element]) => {
      if (!element.type) {
        return false;
      }

      if (element.max === 0) {
        return false;
      }

      // mostly for Extension.url
      if (key === 'url' && element.fixed) {
        return false;
      }

      if (EXTENSION_KEYS.has(key) && !isPopulated(element.slicing?.slices)) {
        // an extension property without slices has no nested extensions
        return false;
      } else if (IGNORED_PROPERTIES.has(key)) {
        return false;
      } else if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && element.path.split('.').length === 2) {
        return false;
      }

      // Profiles can include nested elements in addition to their containing element, e.g.:
      // identifier, identifier.use, identifier.system
      // Skip nested elements, e.g. identifier.use, since they are handled by the containing element
      if (key.includes('.')) {
        return false;
      }

      return true;
    });

    return result;
  }, [elements]);

  function setValueWrapper(newValue: any): void {
    for (const [key, prop] of Object.entries(fixedProperties)) {
      setPropertyValue(newValue, key, key, prop, prop.fixed.value);
    }
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <ElementsContext.Provider value={elementsContextValue}>
      <Stack style={{ flexGrow: 1 }} data-testid={props.testId}>
        {elementsToRender.map(([key, element]) => {
          const [propertyValue, propertyType] = getValueAndTypeFromElement(value, key, element);
          const required = element.min !== undefined && element.min > 0;
          const resourcePropertyInput = (
            <ResourcePropertyInput
              key={key}
              property={element}
              name={key}
              path={props.path + '.' + key}
              defaultValue={propertyValue}
              defaultPropertyType={propertyType}
              onChange={(newValue: any, propName?: string) => {
                setValueWrapper(setPropertyValue({ ...value }, key, propName ?? key, element, newValue));
              }}
              arrayElement={undefined}
              outcome={props.outcome}
            />
          );

          // no FormSection wrapper for extensions
          if (props.type === 'Extension' || EXTENSION_KEYS.has(key)) {
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
    </ElementsContext.Provider>
  );
}
