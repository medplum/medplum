import { Stack } from '@mantine/core';
import { getPropertyDisplayName, tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';

export interface BackboneElementInputProps {
  typeName: string;
  defaultValue?: any;
  outcome?: OperationOutcome;
  onChange?: (value: any) => void;
}

export function BackboneElementInput(props: BackboneElementInputProps): JSX.Element {
  const [value, setValue] = useState<any>(props.defaultValue ?? {});

  function setValueWrapper(newValue: any): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  const typeName = props.typeName;
  const typeSchema = tryGetDataType(typeName);
  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  const typedValue = { type: typeName, value };

  return (
    <Stack>
      {Object.entries(typeSchema.elements).map(([key, property]) => {
        if (key === 'id' || DEFAULT_IGNORED_PROPERTIES.includes(key)) {
          return null;
        }
        if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && property.path.split('.').length === 2) {
          return null;
        }
        if (!property.type) {
          return null;
        }

        const [propertyValue, propertyType] = getValueAndType(typedValue, key);
        const required = property.min !== undefined && property.min > 0;

        if (property.type.length === 1 && property.type[0].code === 'boolean') {
          return (
            <CheckboxFormSection
              key={key}
              title={getPropertyDisplayName(key)}
              description={property.description}
              htmlFor={key}
            >
              <ResourcePropertyInput
                property={property}
                name={key}
                defaultValue={propertyValue}
                defaultPropertyType={propertyType}
                outcome={props.outcome}
                onChange={(newValue: any, propName?: string) => {
                  setValueWrapper(setPropertyValue(value, key, propName ?? key, property, newValue));
                }}
              />
            </CheckboxFormSection>
          );
        }

        return (
          <FormSection
            key={key}
            title={getPropertyDisplayName(key)}
            description={property.description}
            withAsterisk={required}
            htmlFor={key}
            outcome={props.outcome}
          >
            <ResourcePropertyInput
              property={property}
              name={key}
              defaultValue={propertyValue}
              defaultPropertyType={propertyType}
              onChange={(newValue: any, propName?: string) => {
                setValueWrapper(setPropertyValue(value, key, propName ?? key, property, newValue));
              }}
            />
          </FormSection>
        );
      })}
    </Stack>
  );
}
