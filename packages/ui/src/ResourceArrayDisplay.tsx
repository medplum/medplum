import { ElementDefinition } from '@medplum/core';
import React from 'react';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

interface ResourceArrayDisplayProps {
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
          property={property}
          value={v} />
      ))}
    </>
  );
}
