import { capitalize, getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition, ElementDefinitionType, OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { FormSection } from './FormSection';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyInput } from './ResourcePropertyInput';
import { useResource } from './useResource';

export interface ResourceFormProps {
  defaultValue: Resource | Reference;
  outcome?: OperationOutcome;
  onSubmit: (resource: Resource) => void;
  onDelete?: (resource: Resource) => void;
}

export function ResourceForm(props: ResourceFormProps) {
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    if (defaultValue) {
      setValue(JSON.parse(JSON.stringify(defaultValue)));
      medplum.requestSchema(defaultValue.resourceType).then(setSchema);
    }
  }, [defaultValue]);

  if (!schema || !value) {
    return <div>Loading...</div>;
  }

  const typeSchema = schema.types[value.resourceType];
  if (!typeSchema) {
    return <div>Schema not found</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (props.onSubmit) {
          props.onSubmit(value);
        }
      }}
    >
      <FormSection title="Resource Type">
        <input name="resourceType" type="text" defaultValue={value.resourceType} disabled={true} />
      </FormSection>
      <FormSection title="ID">
        <input name="id" type="text" defaultValue={value.id} disabled={true} />
      </FormSection>
      {Object.entries(typeSchema.properties).map((entry) => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        return (
          <FormSection
            key={key}
            title={getPropertyDisplayName(property)}
            description={property.definition}
            htmlFor={key}
            outcome={props.outcome}
          >
            <ResourcePropertyInput
              schema={schema}
              property={property}
              name={key}
              defaultValue={getDefaultValue(value, key, entry[1])}
              outcome={props.outcome}
              onChange={(newValue: any, propName?: string) => {
                setValue(setPropertyValue(value, key, propName ?? key, entry[1], newValue));
              }}
            />
          </FormSection>
        );
      })}
      <Button type="submit" size="large">
        OK
      </Button>
      {props.onDelete && (
        <Button
          type="button"
          size="large"
          onClick={() => {
            (props.onDelete as (resource: Resource) => void)(value);
          }}
        >
          Delete
        </Button>
      )}
    </form>
  );
}

export function getDefaultValue(obj: any, key: string, elementDefinition: ElementDefinition): any {
  const types = elementDefinition.type as ElementDefinitionType[];
  if (types.length === 1) {
    return obj[key];
  }
  for (const type of types) {
    const compoundKey = key.replace('[x]', capitalize(type.code as string));
    if (compoundKey in obj) {
      return obj[compoundKey];
    }
  }
  return undefined;
}

export function setPropertyValue(
  obj: any,
  key: string,
  propName: string,
  elementDefinition: ElementDefinition,
  value: any
): any {
  const types = elementDefinition.type as ElementDefinitionType[];
  if (types.length > 1) {
    for (const type of types) {
      const compoundKey = key.replace('[x]', capitalize(type.code as string));
      if (compoundKey in obj) {
        delete obj[compoundKey];
      }
    }
  }
  obj[propName] = value;
  return obj;
}
