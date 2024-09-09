import { Stack, Text } from '@mantine/core';
import { addProfileToResource } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, SupportedProfileStructureDefinition } from '@medplum/react';
import { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
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
