import { ResourceType } from '@medplum/fhirtypes';
import { Document, Loading, ResourceTable, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function ResourceDetailsPage(): JSX.Element {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return <Loading />;
  }

  return (
    <Document>
      <ResourceTable value={resource} />
    </Document>
  );
}
