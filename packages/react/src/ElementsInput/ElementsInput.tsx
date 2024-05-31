import { Stack } from '@mantine/core';
import { TypedValue, getPathDisplayName } from '@medplum/core';
import { useContext, useMemo, useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndTypeFromElement } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { EXTENSION_KEYS, ElementsContext, getElementsToRender } from './ElementsInput.utils';
import { BaseInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export interface ElementsInputProps extends BaseInputProps {
  readonly type: string;
  readonly defaultValue: any;
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
        const valuePath = props.valuePath ? props.valuePath + '.' + key : undefined;
        const resourcePropertyInput = (
          <ResourcePropertyInput
            key={key}
            property={element}
            name={key}
            path={props.path + '.' + key}
            valuePath={valuePath}
            defaultValue={propertyValue}
            defaultPropertyType={propertyType}
            onChange={(newValue: any, propName?: string) => {
              setValueWrapper(setPropertyValue({ ...value }, key, propName ?? key, element, newValue));
            }}
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
              readonly={element.readonly}
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
            errorExpression={valuePath}
            readonly={element.readonly}
          >
            {resourcePropertyInput}
          </FormSection>
        );
      })}
    </Stack>
  );
}
