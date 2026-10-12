// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ResourceFormWithRequiredProfile } from '../../components/ResourceFormWithRequiredProfile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { RESOURCE_PROFILE_URLS } from './utils';

export function ResourceEditPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType | undefined; id: string | undefined };
  const [value, setValue] = useState<Resource | undefined>();
  const navigate = useAppNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const profileUrl = resourceType && RESOURCE_PROFILE_URLS[resourceType];

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType, id)
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
