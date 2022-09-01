import { getPropertyDisplayName, globalSchema } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { InlineFormSection } from './InlineFormSection';
import { setPropertyValue } from './ResourceForm';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface InlineBackboneElementProps {
  typeName: string;
  defaultValue?: any;
  outcome?: OperationOutcome;
  onChange?: (value: any) => void;
}

export function InlineBackboneElement(props: InlineBackboneElementProps): JSX.Element {
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
    <>
      {Object.entries(typeSchema.properties).map((entry) => {
        const key = entry[0];
        if (key === 'id' || DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }

        const property = entry[1];
        if (!property.type) {
          return null;
        }

        const [propertyValue, propertyType] = getValueAndType(typedValue, key);

        return (
          <InlineFormSection
            key={key}
            title={getPropertyDisplayName(key)}
            description={property.definition}
            htmlFor={key}
            outcome={props.outcome}
            input={
              <ResourcePropertyInput
                property={property}
                name={key}
                defaultPropertyType={propertyType}
                defaultValue={propertyValue}
                outcome={props.outcome}
                onChange={(newValue: any, propName?: string) => {
                  setValueWrapper(setPropertyValue(value, key, propName ?? key, entry[1], newValue));
                }}
              />
            }
            display={<ResourcePropertyDisplay property={property} propertyType={propertyType} value={propertyValue} />}
          ></InlineFormSection>
        );
      })}
    </>
  );
}
