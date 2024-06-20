import { Button, Group, Stack, Switch, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  addProfileToResource,
  deepClone,
  normalizeErrorString,
  normalizeOperationOutcome,
  removeProfileFromResource,
} from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, SupportedProfileStructureDefinition, useMedplum } from '@medplum/react';
import { FC, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProfileTabs } from './ProfileTabs';
import { cleanResource } from './utils';

export function ProfilesPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [resource, setResource] = useState<Resource | undefined>();
  const [currentProfile, setCurrentProfile] = useState<SupportedProfileStructureDefinition>();

  useEffect(() => {
    medplum
      .readResource(resourceType, id)
      .then((resource) => setResource(deepClone(resource)))
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });
  }, [medplum, resourceType, id]);

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <Title order={2}>Available {resourceType} profiles</Title>
      <Stack>
        <>
          <ProfileTabs resource={resource} currentProfile={currentProfile} onChange={setCurrentProfile} />
          {currentProfile ? (
            <ProfileDetail
              key={currentProfile.url}
              profile={currentProfile}
              resource={resource}
              onResourceUpdated={(newResource) => setResource(newResource)}
            />
          ) : (
            <Text my="lg" fz="lg" fs="italic" ta="center">
              Select a profile above
            </Text>
          )}
        </>
      </Stack>
    </Document>
  );
}

type ProfileDetailProps = {
  readonly profile: SupportedProfileStructureDefinition;
  readonly resource: Resource;
  readonly onResourceUpdated: (newResource: Resource) => void;
};

const ProfileDetail: FC<ProfileDetailProps> = ({ profile, resource, onResourceUpdated }) => {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [active, setActive] = useState(() => resource.meta?.profile?.includes(profile.url));

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      const cleanedResource = cleanResource(newResource);
      if (active) {
        addProfileToResource(cleanedResource, profile.url);
      } else {
        removeProfileFromResource(cleanedResource, profile.url);
      }

      medplum
        .updateResource(cleanedResource)
        .then((resp) => {
          onResourceUpdated(resp);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, profile.url, onResourceUpdated, active]
  );

  return (
    <Stack>
      <Switch
        size="md"
        checked={active}
        label={`Conform resource to ${profile.title}`}
        onChange={(e) => setActive(e.currentTarget.checked)}
        data-testid="profile-toggle"
      />
      {active ? (
        <ResourceForm profileUrl={profile.url} defaultValue={resource} onSubmit={handleSubmit} outcome={outcome} />
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(resource);
          }}
        >
          <Group justify="flex-end" mt="xl">
            <Button type="submit">OK</Button>
          </Group>
        </form>
      )}
    </Stack>
  );
};
