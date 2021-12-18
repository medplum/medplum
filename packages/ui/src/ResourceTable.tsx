import { getPropertyDisplayName, IndexedStructureDefinition } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { DEFAULT_IGNORED_PROPERTIES } from './constants';
import { DescriptionList, DescriptionListEntry } from './DescriptionList';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import { useResource } from './useResource';

export interface ResourceTableProps {
  value: Resource | Reference;
  ignoreMissingValues?: boolean;
}

export function ResourceTable(props: ResourceTableProps) {
  const medplum = useMedplum();
  const value = useResource(props.value);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();

  useEffect(() => {
    if (value) {
      medplum.getTypeDefinition(value.resourceType).then(setSchema);
    }
  }, [value]);

  if (!schema || !value) {
    return <div>Loading...</div>;
  }

  const typeSchema = schema.types[value.resourceType];
  if (!typeSchema) {
    return <div>Schema not found</div>;
  }

  return (
    <DescriptionList>
      <DescriptionListEntry term="Resource Type">{value.resourceType}</DescriptionListEntry>
      <DescriptionListEntry term="ID">{value.id}</DescriptionListEntry>
      {Object.entries(typeSchema.properties).map((entry) => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        const propertyValue = (value as any)[key];
        if (props.ignoreMissingValues && !propertyValue) {
          return null;
        }
        return (
          <DescriptionListEntry key={key} term={getPropertyDisplayName(property)}>
            <ResourcePropertyDisplay schema={schema} property={property} value={propertyValue} />
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
