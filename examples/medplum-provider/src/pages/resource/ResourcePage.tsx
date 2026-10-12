// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, LinkTabs, useMedplum, useMedplumErrorHandler } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import classes from './ResourcePage.module.css';
import { useResourceType } from './useResourceType';

const baseTabs = ['Details', 'Edit', 'History'];

export function ResourcePage(): JSX.Element | null {
  const navigate = useAppNavigate();
  const medplum = useMedplum();
  const onError = useMedplumErrorHandler();

  const project = medplum.getProject();
  const schedulingEnabled = project?.features?.includes('scheduling');

  const { resourceType, id } = useParams();
  const [resource, setResource] = useState<Resource | undefined>(undefined);

  useResourceType(resourceType, { onInvalidResourceType: () => navigate('..') });

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch((err: unknown) => onError(err, { source: 'ResourcePage' }));
    }
  }, [medplum, onError, resourceType, id, navigate]);

  const tabs = [...baseTabs];
  if (resourceType === 'HealthcareService' && schedulingEnabled) {
    tabs.push('Scheduling');
  }

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Stack>
        <LinkTabs variant="pills" baseUrl={`/${resourceType}/${id}`} tabs={tabs} classNames={classes} />
        <Outlet />
      </Stack>
    </Document>
  );
}
