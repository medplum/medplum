import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ResourceFormWithRequiredProfile } from '../../components/ResourceFormWithRequiredProfile';
import { RESOURCE_PROFILE_URLS } from './utils';

export function ResourceEditPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType | undefined; id: string | undefined };
  const [value, setValue] = useState<Resource | undefined>();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const profileUrl = resourceType && RESOURCE_PROFILE_URLS[resourceType];

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then((resource) => setValue(deepClone(resource)))
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    }
  }, [medplum, resourceType, id]);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      medplum
        .updateResource(newResource)
        .then(() => {
          navigate('..');
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, navigate]
  );

  const handleDelete = useCallback(() => navigate('..'), [navigate]);

  if (!value) {
    return null;
  }

  return (
    <ResourceFormWithRequiredProfile
      defaultValue={value}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
      outcome={outcome}
      profileUrl={profileUrl}
    />
  );
}
