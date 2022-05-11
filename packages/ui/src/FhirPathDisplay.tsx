import { PropertyType } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { evalFhirPath } from '@medplum/fhirpath';
import React from 'react';
import { ResourcePropertyDisplay } from '.';

export interface FhirPathDisplayProps {
  resource: Resource;
  path: string;
  propertyType: PropertyType;
}

export function FhirPathDisplay(props: FhirPathDisplayProps): JSX.Element {
  const value = evalFhirPath(props.path, props.resource);

  if (value.length > 1) {
    console.log('Error!');
    throw new Error(
      `Component "path" for "FhirPathDisplay" must resolve to a single element. \
       Received ${value.length} elements \
       [${JSON.stringify(value, null, 2)}]`
    );
  }
  return <ResourcePropertyDisplay value={value[0] || ''} propertyType={props.propertyType} />;
}
