import { ResourceType } from '@medplum/fhirtypes';
import { ResourceHistoryTable } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function ResourceHistoryPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType | undefined; id: string | undefined };

  if (!resourceType || !id) {
    return null;
  }

  return <ResourceHistoryTable key={`${resourceType}/${id}`} resourceType={resourceType} id={id} />;
}
