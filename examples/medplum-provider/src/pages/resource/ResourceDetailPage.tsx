import { Stack, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { ResourceTable, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function ResourceDetailPage(): JSX.Element | null {
  const { resourceType, id } = useParams();
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Stack>
      <Title>{getDisplayString(resource)}</Title>
      <ResourceTable key={`${resourceType}/${id}`} value={resource} />
    </Stack>
  );
}
