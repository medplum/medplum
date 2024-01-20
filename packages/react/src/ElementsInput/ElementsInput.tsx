import { Stack } from '@mantine/core';
import { TypedValue, getPathDisplayName, isPopulated } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndTypeFromElement } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { ElementsContext } from './ElementsInput.utils';
import useCallbackState from '../hooks/useCallbackState';

const EXTENSION_KEYS = new Set(['extension', 'modifierExtension']);
const IGNORED_PROPERTIES = new Set(['id', ...DEFAULT_IGNORED_PROPERTIES].filter((prop) => !EXTENSION_KEYS.has(prop)));

export interface ElementsInputProps {
  type: string;
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  path: string;
  defaultValue: any;
  outcome: OperationOutcome | undefined;
  onChange: ((value: any) => void) | undefined;
  testId?: string;
}

export function ElementsInput(props: ElementsInputProps): JSX.Element {
  const { onChange } = props;
  const [value, setValue] = useCallbackState<any>({
    initialState: () => props.defaultValue ?? {},
  });
  const elementsContext = useContext(ElementsContext);
  const elementsToRender = useMemo(() => {
    const result = Object.entries(elementsContext.elements).filter(([key, element]) => {
      if (!isPopulated(element.type)) {
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
  }, [elementsContext.elements]);

  const onChangeCallbacks = useMemo(() => {
    const result = elementsToRender.map(([key, element]) => {
      return (newPropValue: any, propName?: string) => {
        setValue((prevValue: any) => {
          const newValue = setPropertyValue({ ...prevValue }, key, propName ?? key, element, newPropValue);
          for (const [key, prop] of Object.entries(elementsContext.fixedProperties)) {
            setPropertyValue(newValue, key, key, prop, prop.fixed.value);
          }
          return newValue;
        }, onChange);
      };
    });
    return result;
  }, [elementsToRender, setValue, onChange, elementsContext.fixedProperties]);
  const typedValue: TypedValue = { type: props.type, value };

  return (
    <Stack style={{ flexGrow: 1 }} data-testid={props.testId}>
      {elementsToRender.map(([key, element], elementIndex) => {
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
            onChange={onChangeCallbacks[elementIndex]}
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
  );
}
