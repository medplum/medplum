import { PropertyType } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { evalFhirPath } from '@medplum/fhirpath';
import React from 'react';
import { ResourcePropertyDisplay } from '.';

export interface SmartResourcePropertyDisplayProps {
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

export function SmartResourcePropertyDisplay(props: SmartResourcePropertyDisplayProps): JSX.Element {
  const value = evalFhirPath(props.path, props.resource);

  if (value?.[0] && value.length === 1) {
    return <ResourcePropertyDisplay value={value?.[0] || ''} propertyType={PropertyType.string} />;
  }
  return <></>;
}
