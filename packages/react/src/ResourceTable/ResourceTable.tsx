import { IndexedStructureDefinition } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { BackboneElementDisplay } from '../BackboneElementDisplay/BackboneElementDisplay';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { useResource } from '../useResource/useResource';

export interface ResourceTableProps {
  /**
   * The input value either as a resource or a reference.
   */
  value: Resource | Reference;

  /**
   * Optional flag to ignore missing values.
   * By default, missing values are displayed as empty strings.
   */
  ignoreMissingValues?: boolean;

  /**
   * Optional flag to force use the input value.
   * This is useful when you want to display a specific version of the resource,
   * and not use the latest version.
   */
  forceUseInput?: boolean;
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
      value={{
        type: value.resourceType,
        value: props.forceUseInput ? props.value : value,
      }}
      ignoreMissingValues={props.ignoreMissingValues}
    />
  );
}
