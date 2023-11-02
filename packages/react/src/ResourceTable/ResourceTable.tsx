import { Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { useEffect, useState } from 'react';
import { BackboneElementDisplay } from '../BackboneElementDisplay/BackboneElementDisplay';

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
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    if (value) {
      medplum
        .requestSchema(value.resourceType)
        .then(() => setSchemaLoaded(true))
        .catch(console.log);
    }
  }, [medplum, value]);

  if (!schemaLoaded || !value) {
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
