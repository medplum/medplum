import { Stack } from '@mantine/core';
import { InternalSchemaElement, TypedValue, getPathDisplayName, isPopulated } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndTypeFromElement } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { ElementsContext } from './ElementsInput.utils';

const EXTENSION_KEYS = ['extension', 'modifierExtension'];
const IGNORED_PROPERTIES = ['id', ...DEFAULT_IGNORED_PROPERTIES].filter((prop) => !EXTENSION_KEYS.includes(prop));

export interface ElementsInputProps {
  readonly type: string;
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  readonly defaultValue: any;
  readonly outcome: OperationOutcome | undefined;
  readonly onChange: ((value: any) => void) | undefined;
  readonly testId?: string;
}

export function ElementsInput(props: ElementsInputProps): JSX.Element {
  const [value, setValue] = useState<any>(props.defaultValue ?? {});
  const elementsContext = useContext(ElementsContext);
  const elementsToRender = useMemo(() => {
    return getElementsToRender(elementsContext.elements);
  }, [elementsContext.elements]);

  function setValueWrapper(newValue: any): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  const typedValue: TypedValue = { type: props.type, value };

  return (
    <Stack style={{ flexGrow: 1 }} data-testid={props.testId}>
      {elementsToRender.map(([key, element]) => {
        const [propertyValue, propertyType] = getValueAndTypeFromElement(typedValue, key, element);
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

function getElementsToRender(inputElements: Record<string, InternalSchemaElement>): [string, InternalSchemaElement][] {
  const result = Object.entries(inputElements).filter(([key, element]) => {
    if (!isPopulated(element.type)) {
      return false;
    }

    if (element.max === 0) {
      return false;
    }

    // toLowerCase to handle Extension.url as well as Extension.extension.url, etc.
    if (element.path.toLowerCase().endsWith('extension.url') && element.fixed) {
      return false;
    }

    if (EXTENSION_KEYS.includes(key) && !isPopulated(element.slicing?.slices)) {
      // an extension property without slices has no nested extensions
      return false;
    } else if (IGNORED_PROPERTIES.includes(key)) {
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
}
