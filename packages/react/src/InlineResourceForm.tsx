import { IndexedStructureDefinition } from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { FormSection } from './FormSection';
import { InlineBackboneElement } from './InlineBackboneElement';
import { useMedplum } from './MedplumProvider';
import { useResource } from './useResource';

export interface InlineResourceFormProps {
  defaultValue: Resource | Reference;
  outcome?: OperationOutcome;
  onSubmit: (resource: Resource) => void;
  onDelete?: (resource: Resource) => void;
}

export function InlineResourceForm(props: InlineResourceFormProps): JSX.Element {
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    if (defaultValue) {
      setValue(JSON.parse(JSON.stringify(defaultValue)));
      medplum.requestSchema(defaultValue.resourceType).then(setSchema).catch(console.log);
    }
  }, [medplum, defaultValue]);

  if (!schema || !value) {
    return <div>Loading...</div>;
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
        <div>{value.resourceType}</div>
      </FormSection>
      <FormSection title="ID">
        <div>{value.id}</div>
      </FormSection>
      <InlineBackboneElement
        typeName={value.resourceType}
        defaultValue={value}
        outcome={props.outcome}
        onChange={setValue}
      />
    </form>
  );
}
