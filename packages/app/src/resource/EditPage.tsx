import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum, useResource } from '@medplum/react';
import React, { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cleanResource } from './utils';

export function EditPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      medplum
        .updateResource(cleanResource(newResource))
        .then(() => {
          setOutcome(undefined);
          navigate(`/${resourceType}/${id}/details`);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        });
    },
    [medplum, resourceType, id, navigate]
  );

  const handleDelete = useCallback(() => navigate(`/${resourceType}/${id}/delete`), [navigate, resourceType, id]);

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <ResourceForm defaultValue={resource} onSubmit={handleSubmit} onDelete={handleDelete} outcome={outcome} />
    </Document>
  );
}
