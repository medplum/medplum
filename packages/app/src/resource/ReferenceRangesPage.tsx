import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { ObservationDefinition, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ReferenceRangeEditor, useMedplum, useResource } from '@medplum/react';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { cleanResource } from './utils';

export function ReferenceRangesPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      medplum
        .updateResource(cleanResource(newResource))
        .then(() => {
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum]
  );

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <ReferenceRangeEditor onSubmit={handleSubmit} definition={resource as ObservationDefinition} />
    </Document>
  );
}
