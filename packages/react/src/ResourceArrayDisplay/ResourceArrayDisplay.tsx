import { PropertyType } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import React from 'react';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

interface ResourceArrayDisplayProps {
  property: ElementDefinition;
  values: any[];
  arrayElement?: boolean;
  ignoreMissingValues?: boolean;
  link?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps): JSX.Element {
  const property = props.property;
  const values = props.values ?? [];
  const propertyType = property.type?.[0]?.code as PropertyType;
  return (
    <>
      {values.map((v: any, index: number) => (
        <div key={`${index}-${values.length}`}>
          <ResourcePropertyDisplay
            arrayElement={true}
            property={property}
            propertyType={propertyType}
            value={v}
            ignoreMissingValues={props.ignoreMissingValues}
            link={props.link}
          />
        </div>
      ))}
    </>
  );
}
