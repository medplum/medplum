import { PropertyType } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { evalFhirPath } from '@medplum/fhirpath';
import React from 'react';
import { ResourcePropertyDisplay } from '.';

export interface FhirPathDisplayProps {
  resource: Resource;
  path: string;
  // property?: ElementDefinition;
  // propertyType: PropertyType;
  // value: any;
  // arrayElement?: boolean;
  // maxWidth?: number;
  // ignoreMissingValues?: boolean;
  // link?: boolean;
}

export function FhirPathDisplay(props: FhirPathDisplayProps): JSX.Element | null {
  const value = evalFhirPath(props.path, props.resource);

  if (value.length === 1) {
    return <ResourcePropertyDisplay value={value?.[0] || ''} propertyType={PropertyType.string} />;
  }
  return null;
}
