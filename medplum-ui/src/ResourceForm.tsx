import { Resource, schema } from 'medplum';
import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { FormSection } from './FormSection';
import { useMedplum } from './MedplumProvider';
import { ResourceField } from './ResourceField';

export interface ResourceFormProps {
  resourceType: string;
  id: string;
  onSubmit: (e: React.FormEvent) => void;
}

export function ResourceForm(props: any) {
  const medplum = useMedplum();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    medplum.read(props.resourceType, props.id)
      .then(result => setValue(result));
  }, [props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>
  }

  const typeSchema = schema[props.resourceType];

  return (
    <form noValidate autoComplete="off" onSubmit={props.onSubmit}>
      <FormSection title="Resource Type">
        <input name="resourceType" type="text" defaultValue={props.resourceType} disabled={true} />
      </FormSection>
      <FormSection title="ID">
        <input name="id" type="text" defaultValue={value.id} disabled={true} />
      </FormSection>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        const property = entry[1];
        return (
          <FormSection key={key} title={property.display} description={property.description}>
            <ResourceField propertyPrefix="" property={property} value={(value as any)[key]} />
          </FormSection>
        );
      })}
      <Button type="submit" size="large">OK</Button>
    </form>
  );
}
