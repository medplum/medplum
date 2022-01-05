import { buildTypeName, getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition, OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { FormSection } from './FormSection';
import { getDefaultValue, setPropertyValue } from './ResourceForm';
import { ResourcePropertyInput } from './ResourcePropertyInput';

export interface BackboneElementInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
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

  const typeName = buildTypeName(props.property.path?.split('.') as string[]);
  const typeSchema = props.schema.types[typeName];
  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  return (
    <>
      {Object.entries(typeSchema.properties).map((entry) => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        if (!property.type) {
          return null;
        }
        const name = props.name + '.' + key;
        return (
          <FormSection
            key={key}
            title={getPropertyDisplayName(property)}
            description={property.definition}
            htmlFor={name}
            outcome={props.outcome}
          >
            <ResourcePropertyInput
              schema={props.schema}
              property={property}
              name={name}
              defaultValue={getDefaultValue(value, key, entry[1])}
              outcome={props.outcome}
              onChange={(newValue: any, propName?: string) => {
                setValueWrapper(setPropertyValue(value, key, propName ?? key, entry[1], newValue));
              }}
            />
          </FormSection>
        );
      })}
    </>
  );
}
