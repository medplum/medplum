import { PropertySchema } from '@medplum/core';
import React from 'react';
import { ensureKeys } from './FormUtils';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

interface ResourceArrayDisplayProps {
  property: PropertySchema;
  values: any[];
  arrayElement?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps) {
  const property = props.property;
  const values = ensureKeys(props.values);
  return (
    <>
      {values.map(v => (
        <ResourcePropertyDisplay
          key={v.__key}
          arrayElement={true}
          property={property}
          value={v} />
      ))}
    </>
  );
}
