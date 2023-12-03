import { ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceTable, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function DetailsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <ResourceTable value={resource} />
    </Document>
  );
}
