import { IndexedStructureDefinition } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { BackboneElementDisplay } from './BackboneElementDisplay';
import { useMedplum } from './MedplumProvider';
import { useResource } from './useResource';

export interface ResourceTableProps {
  value: Resource | Reference;
  ignoreMissingValues?: boolean;
}

export function ResourceTable(props: ResourceTableProps) {
  const medplum = useMedplum();
  const value = useResource(props.value);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();

  useEffect(() => {
    if (value) {
      medplum.getTypeDefinition(value.resourceType).then(setSchema);
    }
  }, [value]);

  if (!schema || !value) {
    return null;
  }

  return (
    <BackboneElementDisplay
      schema={schema}
      typeName={value.resourceType}
      value={value}
      ignoreMissingValues={props.ignoreMissingValues}
    />
  );
}
