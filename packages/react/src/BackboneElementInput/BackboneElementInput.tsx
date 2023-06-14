import { Stack } from '@mantine/core';
import { getPropertyDisplayName, globalSchema } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { DEFAULT_IGNORED_PROPERTIES } from '../constants';
import { FormSection } from '../FormSection/FormSection';
import { setPropertyValue } from '../ResourceForm/ResourceForm';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
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
  const typeSchema = globalSchema.types[typeName];
  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  const typedValue = { type: typeName, value };

  return (
    <Stack>
      {Object.entries(typeSchema.properties).map((entry) => {
        const key = entry[0];
        if (key === 'id' || DEFAULT_IGNORED_PROPERTIES.includes(key)) {
          return null;
        }
        const property = entry[1];
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
              description={property.definition}
              htmlFor={key}
            >
              <ResourcePropertyInput
                property={property}
                name={key}
                defaultValue={propertyValue}
                defaultPropertyType={propertyType}
                outcome={props.outcome}
                onChange={(newValue: any, propName?: string) => {
                  setValueWrapper(setPropertyValue(value, key, propName ?? key, entry[1], newValue));
                }}
              />
            </CheckboxFormSection>
          );
        }

        return (
          <FormSection
            key={key}
            title={getPropertyDisplayName(key)}
            description={property.definition}
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
                setValueWrapper(setPropertyValue(value, key, propName ?? key, entry[1], newValue));
              }}
            />
          </FormSection>
        );
      })}
    </Stack>
  );
}
