import { Button, Group, Stack, Switch, Tabs, Text, ThemeIcon, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import {
  Document,
  ResourceForm,
  SupportedProfileStructureDefinition,
  isSupportedProfileStructureDefinition,
  useMedplum,
} from '@medplum/react';
import { IconCircleFilled } from '@tabler/icons-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addProfileToResource, cleanResource, removeProfileFromResource } from './utils';

export function ProfilesPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [resource, setResource] = useState<Resource | undefined>();
  const [currentProfile, setCurrentProfile] = useState<SupportedProfileStructureDefinition>();
  const [availableProfiles, setAvailableProfiles] = useState<SupportedProfileStructureDefinition[]>();

  useEffect(() => {
    medplum
      .readResource(resourceType, id)
      .then((resource) => setResource(deepClone(resource)))
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });
  }, [medplum, resourceType, id]);

  // This is a bit inefficient since the entire structure definition
  // for each available profile is being fetched. All that is really needed is the title & url
  // The SD is useful for the time being to populate the Snapshot and JSON debugging tabs;
  // but those will likely be removed before deploying
  useEffect(() => {
    medplum
      .searchResources('StructureDefinition', { type: resourceType, derivation: 'constraint', _count: 50 })
      .then((results) => {
        setAvailableProfiles(results.filter(isSupportedProfileStructureDefinition));
      })
      .catch(console.error);
  }, [medplum, resourceType]);

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <Title order={2}>Available {resourceType} profiles</Title>
      <Stack>
        <>
          <Tabs
            value={currentProfile?.url}
            onChange={(newProfileUrl) => setCurrentProfile(availableProfiles?.find((p) => p.url === newProfileUrl))}
          >
            <Tabs.List>
              {availableProfiles?.map((profile) => {
                const isActive = resource.meta?.profile?.includes(profile.url);
                const title = isActive
                  ? `This profile is present in this resource's meta.profile property.`
                  : `This profile is not included in this resource's meta.profile property.`;
                return (
                  <Tabs.Tab
                    key={profile.url}
                    value={profile.url}
                    title={title}
                    rightSection={
                      isActive && (
                        <ThemeIcon variant="outline" color="green" size="xs" style={{ borderStyle: 'none' }}>
                          <IconCircleFilled size="90%" />
                        </ThemeIcon>
                      )
                    }
                  >
                    {profile.title || profile.name}
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
          </Tabs>
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
  profile: SupportedProfileStructureDefinition;
  resource: Resource;
  onResourceUpdated: (newResource: Resource) => void;
};

const ProfileDetail: React.FC<ProfileDetailProps> = ({ profile, resource, onResourceUpdated }) => {
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
          showNotification({ color: 'red', message: normalizeErrorString(err) });
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
