// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { addProfileToResource } from '@medplum/core';
import type { OperationOutcome, Resource } from '@medplum/fhirtypes';
import type { SupportedProfileStructureDefinition } from '@medplum/react';
import { Document, ResourceForm } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { ProfileTabs } from './ProfileTabs';
import { useCreateResource } from './useCreateResource';
import { cleanResource } from './utils';

export function FormCreatePage(): JSX.Element {
  const { resourceType } = useParams();
  const location = useLocation();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { defaultValue, handleSubmit } = useCreateResource(resourceType, setOutcome);
  const [currentProfile, setCurrentProfile] = useState<SupportedProfileStructureDefinition | undefined>();

  const isProfilesPage = location.pathname.toLowerCase().endsWith('profiles');

  const onProfileSubmit = useCallback(
    (resource: Resource): void => {
      const cleanedResource = cleanResource(resource);
      if (currentProfile) {
        addProfileToResource(cleanedResource, currentProfile.url);
      }
      handleSubmit(cleanedResource);
    },
    [currentProfile, handleSubmit]
  );

  if (!isProfilesPage) {
    return (
      <Document>
        <ResourceForm defaultValue={defaultValue} onSubmit={handleSubmit} outcome={outcome} />
      </Document>
    );
  }

  return (
    <Document>
      <Stack>
        <ProfileTabs resource={defaultValue} currentProfile={currentProfile} onChange={setCurrentProfile} />
        {currentProfile ? (
          <ResourceForm
            key={currentProfile.url}
            defaultValue={defaultValue}
            onSubmit={onProfileSubmit}
            outcome={outcome}
            profileUrl={currentProfile.url}
          />
        ) : (
          <Text my="lg" fz="lg" fs="italic" ta="center">
            Select a profile above
          </Text>
        )}
      </Stack>
    </Document>
  );
}
