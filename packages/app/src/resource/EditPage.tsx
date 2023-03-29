import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cleanResource } from './utils';

export function EditPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [value, setValue] = useState<Resource | undefined>();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  useEffect(() => {
    medplum
      .readResource(resourceType, id)
      .then((resource) => setValue(deepClone(resource)))
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });
  }, [medplum, resourceType, id]);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      medplum
        .updateResource(cleanResource(newResource))
        .then(() => {
          navigate(`/${resourceType}/${id}/details`);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        });
    },
    [medplum, resourceType, id, navigate]
  );

  const handleDelete = useCallback(() => navigate(`/${resourceType}/${id}/delete`), [navigate, resourceType, id]);

  if (!value) {
    return null;
  }

  return (
    <Document>
      <ResourceForm defaultValue={value} onSubmit={handleSubmit} onDelete={handleDelete} outcome={outcome} />
    </Document>
  );
}
