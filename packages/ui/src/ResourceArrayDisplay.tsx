import { IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import React from 'react';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

interface ResourceArrayDisplayProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  values: any[];
  arrayElement?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps) {
  const property = props.property;
  const values = props.values ?? [];
  return (
    <>
      {values.map((v: any, index: number) => (
        <ResourcePropertyDisplay
          key={`${index}-${values.length}`}
          arrayElement={true}
          schema={props.schema}
          property={property}
          value={v}
        />
      ))}
    </>
  );
}
