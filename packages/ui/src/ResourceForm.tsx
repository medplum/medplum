import { getPropertyDisplayName, IndexedStructureDefinition, OperationOutcome, Reference, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { FormSection } from './FormSection';
import { parseResourceForm } from './FormUtils';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyInput } from './ResourcePropertyInput';
import { useResource } from './useResource';

const DEFAULT_IGNORED_PROPERTIES = [
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension'
];

export interface ResourceFormProps {
  defaultValue: Resource | Reference;
  outcome?: OperationOutcome;
  onSubmit: (formData: any) => void;
}

export function ResourceForm(props: ResourceFormProps) {
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    if (defaultValue) {
      setValue(defaultValue);
      medplum.getTypeDefinition(defaultValue.resourceType).then(setSchema);
    }
  }, [defaultValue]);

  if (!schema || !value) {
    return (
      <div>Loading...</div>
    );
  }

  const typeSchema = schema.types[value.resourceType];
  if (!typeSchema) {
    return (
      <div>Schema not found</div>
    );
  }

  return (
    <form noValidate autoComplete="off" onSubmit={(e: React.FormEvent) => {
      e.preventDefault();
      const formData = parseResourceForm(schema, value.resourceType, e.target as HTMLFormElement, value);
      if (props.onSubmit) {
        props.onSubmit(formData);
      }
    }}>
      <FormSection title="Resource Type">
        <input name="resourceType" type="text" defaultValue={value.resourceType} disabled={true} />
      </FormSection>
      <FormSection title="ID">
        <input name="id" type="text" defaultValue={value.id} disabled={true} />
      </FormSection>
      {Object.entries(typeSchema.properties).map(entry => {
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
            outcome={props.outcome}>
            <ResourcePropertyInput
              schema={schema}
              property={property}
              name={key}
              defaultValue={(value as any)[key]}
              outcome={props.outcome}
            />
          </FormSection>
        );
      })}
      <Button type="submit" size="large">OK</Button>
    </form>
  );
}
