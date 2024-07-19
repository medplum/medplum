import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPatch } from 'rfc6902';
import { cleanResource } from './utils';

export function EditPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [original, setOriginal] = useState<Resource | undefined>();
  const [value, setValue] = useState<Resource | undefined>();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  useEffect(() => {
    medplum
      .readResource(resourceType, id)
      .then((resource) => {
        setOriginal(deepClone(resource));
        setValue(deepClone(resource));
      })
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
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
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, resourceType, id, navigate]
  );

  const handlePatch = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      const patchOperations = createPatch(original, newResource);
      medplum
        .patchResource(resourceType, id, patchOperations)
        .then(() => {
          navigate(`/${resourceType}/${id}/details`);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, resourceType, id, original, navigate]
  );

  const handleDelete = useCallback(() => navigate(`/${resourceType}/${id}/delete`), [navigate, resourceType, id]);

  if (!value) {
    return null;
  }

  return (
    <Document>
      <ResourceForm
        defaultValue={value}
        onSubmit={handleSubmit}
        onPatch={handlePatch}
        onDelete={handleDelete}
        outcome={outcome}
      />
    </Document>
  );
}
