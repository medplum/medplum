import { Resource, schema } from 'medplum';
import React, { useEffect, useState } from 'react';
import { DescriptionList, DescriptionListEntry } from './DescriptionList';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

export interface ResourceTableProps {
  resource?: Resource;
  resourceType?: string;
  id?: string;
}

export function ResourceTable(props: any) {
  const medplum = useMedplum();
  const [value, setValue] = useState<Resource | undefined>(props.resource);

  useEffect(() => {
    if (!props.resource && props.resourceType && props.id) {
      medplum.read(props.resourceType, props.id)
        .then(result => setValue(result));
    }
  }, [props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>
  }

  const typeSchema = schema[value.resourceType];

  return (
    <DescriptionList>
      <DescriptionListEntry term="Resource Type">{value.resourceType}</DescriptionListEntry>
      <DescriptionListEntry term="ID">{value.id}</DescriptionListEntry>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        const property = entry[1];
        return (
          <DescriptionListEntry key={key} term={property.display}>
            <ResourcePropertyDisplay propertyPrefix="" property={property} value={(value as any)[key]} />
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
