import { Stack, Text } from '@mantine/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, SupportedProfileStructureDefinition } from '@medplum/react';
import { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useCreateResource } from './useCreateResource';
import { ProfileTabs } from './ProfileTabs';
import { addProfileToResource, cleanResource } from './utils';

export function FormCreatePage(): JSX.Element {
  const { resourceType } = useParams();
  const location = useLocation();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { defaultValue, handleSubmit } = useCreateResource(resourceType, setOutcome);
  const [currentProfile, setCurrentProfile] = useState<SupportedProfileStructureDefinition | undefined>();

  const isProfilesPage = location.pathname.toLowerCase().endsWith('profiles');

  const onSubmit = useCallback(
    (resource: Resource): void => {
      const cleanedResource = cleanResource(resource);
      if (currentProfile) {
        addProfileToResource(cleanedResource, currentProfile.url);
      }
      handleSubmit(cleanedResource);
    },
    [currentProfile, handleSubmit]
  );

  return (
    <Document>
      <Stack>
        {isProfilesPage && (
          <ProfileTabs resource={defaultValue} currentProfile={currentProfile} onChange={setCurrentProfile} />
        )}
        {currentProfile ? (
          <ResourceForm
            key={currentProfile.url}
            defaultValue={defaultValue}
            onSubmit={onSubmit}
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
