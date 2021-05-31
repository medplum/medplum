import { IndexedStructureDefinition, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { DescriptionList, DescriptionListEntry } from './DescriptionList';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const DEFAULT_IGNORED_PROPERTIES = [
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension'
];

export interface ResourceTableProps {
  resource?: Resource;
  resourceType?: string;
  id?: string;
}

export function ResourceTable(props: any) {
  const medplum = useMedplum();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [value, setValue] = useState<Resource | undefined>(props.resource);

  useEffect(() => {
    const resourceType = props.resourceType || props.resource?.resourceType;
    if (!resourceType) {
      throw new Error('Missing resourceType');
    }

    medplum.getTypeDefinition(resourceType).then(typeSchema => setSchema(typeSchema));

    if (!props.resource && props.resourceType && props.id) {
      medplum.read(props.resourceType, props.id).then(result => setValue(result));
    }

  }, [props.resource, props.resourceType, props.id]);

  if (!schema || !value) {
    return <div>Loading...</div>
  }

  const typeSchema = schema.types[value.resourceType];
  if (!typeSchema) {
    return <div>Schema not found</div>
  }

  return (
    <DescriptionList>
      <DescriptionListEntry term="Resource Type">{value.resourceType}</DescriptionListEntry>
      <DescriptionListEntry term="ID">{value.id}</DescriptionListEntry>
      {Object.entries(typeSchema.properties).map(entry => {
        const key = entry[0];
        if (DEFAULT_IGNORED_PROPERTIES.indexOf(key) >= 0) {
          return null;
        }
        const property = entry[1];
        return (
          <DescriptionListEntry key={key} term={property.display}>
            <ResourcePropertyDisplay property={property} value={(value as any)[key]} />
          </DescriptionListEntry>
        );
      })}
    </DescriptionList>
  );
}
