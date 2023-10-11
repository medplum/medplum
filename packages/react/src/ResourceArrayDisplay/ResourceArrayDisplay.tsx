import { InternalSchemaElement } from '@medplum/core';
import React from 'react';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

interface ResourceArrayDisplayProps {
  property: InternalSchemaElement;
  values: any[];
  arrayElement?: boolean;
  ignoreMissingValues?: boolean;
  link?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps): JSX.Element {
  const { property, values } = props;
  const propertyType = property.type[0].code;
  return props.values ? (
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
  ) : (
    <></>
  );
}
