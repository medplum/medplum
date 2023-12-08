import { Anchor, Loader } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Document, ResourceTable, useResource } from '@medplum/react';
import { IconExternalLink } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';

export function ResourcePage(): JSX.Element | null {
  const { resourceType, id } = useParams();
  const resource = useResource({ reference: `${resourceType}/${id}` });
  if (!resource) {
    return <Loader />;
  }
  return (
    <Document>
      <h2>
        {getDisplayString(resource)}{' '}
        <sup>
          <Anchor href={`https://app.medplum.com/${resourceType}/${id}`} target="_blank">
            <IconExternalLink size={16} />
          </Anchor>
        </sup>
      </h2>
      <div>
        <ResourceTable key={`${resourceType}/${id}`} value={resource} ignoreMissingValues={true} />
      </div>
    </Document>
  );
}
