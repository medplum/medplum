import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import React from 'react';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

interface ResourceArrayDisplayProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  values: any[];
  arrayElement?: boolean;
  ignoreMissingValues?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps): JSX.Element {
  const property = props.property;
  const values = props.values ?? [];
  const propertyType = property.type?.[0]?.code as PropertyType;
  return (
    <>
      {values.map((v: any, index: number) => (
        <ResourcePropertyDisplay
          key={`${index}-${values.length}`}
          arrayElement={true}
          schema={props.schema}
          property={property}
          propertyType={propertyType}
          value={v}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      ))}
    </>
  );
}
