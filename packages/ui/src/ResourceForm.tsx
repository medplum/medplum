import { getPropertyDisplayName, IndexedStructureDefinition, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { FormSection } from './FormSection';
import { parseResourceForm } from './FormUtils';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyInput } from './ResourcePropertyInput';

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
  resource?: Resource;
  resourceType?: string;
  id?: string;
  onSubmit: (formData: any) => void;
}

export function ResourceForm(props: any) {
  const medplum = useMedplum();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [value, setValue] = useState<Resource | undefined>(props.resource);

  useEffect(() => {
    const resourceType = props.resourceType || props.resource?.resourceType;
    if (!resourceType) {
      throw new Error('Missing resourceType');
    }

    medplum.getTypeDefinition(resourceType).then(typeSchema => setSchema(typeSchema));

    if (!props.resource && props.resourceType && props.id) {
      medplum.read(props.resourceType, props.id).then(result => setValue(result));
    }

  }, [props.resource, props.resourceType, props.id]);

  if (!schema || !value) {
    return <div>Loading...</div>
  }

  const typeSchema = schema.types[value.resourceType];
  if (!typeSchema) {
    return <div>Schema not found</div>
  }

  return (
    <form noValidate autoComplete="off" onSubmit={(e: React.FormEvent) => {
      e.preventDefault();
      const formData = parseResourceForm(typeSchema, e.target as HTMLFormElement, value);
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
          <FormSection key={key} title={getPropertyDisplayName(property)} description={property.definition}>
            <ResourcePropertyInput property={property} name={key} value={(value as any)[key]} />
          </FormSection>
        );
      })}
      <Button type="submit" size="large">OK</Button>
    </form>
  );
}
