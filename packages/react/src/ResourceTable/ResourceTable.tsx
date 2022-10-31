import { IndexedStructureDefinition } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { BackboneElementDisplay } from '../BackboneElementDisplay/BackboneElementDisplay';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { useResource } from '../useResource/useResource';

export interface ResourceTableProps {
  value: Resource | Reference;
  ignoreMissingValues?: boolean;
}

export function ResourceTable(props: ResourceTableProps): JSX.Element | null {
  const medplum = useMedplum();
  const value = useResource(props.value);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();

  useEffect(() => {
    if (value) {
      medplum.requestSchema(value.resourceType).then(setSchema).catch(console.log);
    }
  }, [medplum, value]);

  if (!schema || !value) {
    return null;
  }

  return (
    <BackboneElementDisplay
      value={{ type: value.resourceType, value }}
      ignoreMissingValues={props.ignoreMissingValues}
    />
  );
}
