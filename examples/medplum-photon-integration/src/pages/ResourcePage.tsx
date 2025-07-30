import { Title } from '@mantine/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceTable, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { useParams } from 'react-router';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourcePage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams();
  const [resource, setResource] = useState<Resource | undefined>(undefined);

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch(console.error);
    }
  }, [medplum, resourceType, id]);

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Title>{getDisplayString(resource)}</Title>
      <ResourceTable key={`${resourceType}/${id}`} value={resource} />
    </Document>
  );
}
