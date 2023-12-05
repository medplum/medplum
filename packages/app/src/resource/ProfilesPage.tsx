import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Document,
  SupportedProfileStructureDefinition,
  ResourceForm,
  isSupportedProfileStructureDefinition,
  useMedplum,
} from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { Anchor, Code, Group, Stack, Tabs, ThemeIcon } from '@mantine/core';
import { addProfileToResource, cleanResource } from './utils';
import { IconCheck } from '@tabler/icons-react';
import { partition } from '../utils';

export function ProfilesPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [resource, setResource] = useState<Resource | undefined>();
  const [currentProfile, setCurrentProfile] = useState<SupportedProfileStructureDefinition>();
  const [availableProfiles, setAvailableProfiles] = useState<SupportedProfileStructureDefinition[]>();
  const [_activeProfiles, setActiveProfiles] = useState<SupportedProfileStructureDefinition[]>();

  useEffect(() => {
    medplum
      .readResource(resourceType, id)
      .then((resource) => setResource(deepClone(resource)))
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });
  }, [medplum, resourceType, id]);

  // TODO{mattlong} This is a bit inefficient since the entire structure definition
  // for each available profile is being fetched. All that is really needed is the title & url
  // The SD is useful for the time being to populate the Snapshot and JSON debugging tabs;
  // but those will likely be removed before deploying
  useEffect(() => {
    medplum
      .searchResources('StructureDefinition', { type: resourceType, derivation: 'constraint' })
      .then((results) => {
        const [supported, unsupported] = partition(results, isSupportedProfileStructureDefinition);
        setAvailableProfiles(supported);
        if (unsupported.length > 0) {
          console.warn('Unsupported profile StructureDefinitions', unsupported);
        }
      })
      .catch(console.error);
  }, [medplum, resourceType]);

  useEffect(() => {
    if (availableProfiles) {
      const activeProfiles = availableProfiles.filter(
        (profile) => resource?.meta?.profile?.includes(profile.url ?? '') ?? false
      );
      setActiveProfiles(activeProfiles);
      if (activeProfiles[0]) {
        setCurrentProfile(activeProfiles[0]);
      }
    } else {
      setActiveProfiles([]);
    }
  }, [resource, availableProfiles]);

  if (!resource) {
    return null;
  }

  return (
    <>
      <Document>
        <h2>Available {resourceType} profiles</h2>
        <Stack>
          {availableProfiles?.map((profile, idx) => (
            <ProfileListItem
              key={profile.url ?? idx}
              profile={profile}
              active={resource.meta?.profile?.includes(profile.url ?? '') ?? false}
              onSelect={() => {
                if (currentProfile !== profile) {
                  setCurrentProfile(profile);
                }
              }}
            />
          ))}
          {currentProfile && (
            <ProfileDetail profile={currentProfile} resourceType={resourceType} resource={resource} id={id} />
          )}
        </Stack>
      </Document>
    </>
  );
}

function ProfileListItem({
  profile,
  onSelect,
  active,
}: {
  active: boolean;
  profile: SupportedProfileStructureDefinition;
  onSelect: () => void;
}): JSX.Element {
  return (
    <Group spacing={4}>
      {active && (
        <ThemeIcon variant="light" color="green" size="sm" title="Active profile">
          <IconCheck />
        </ThemeIcon>
      )}
      <Anchor onClick={onSelect}>{profile.title}</Anchor>
    </Group>
  );
}

const TAB_ORDER = ['Summary', 'JSON', 'Snapshot'] as const;
const TAB_NAMES: Record<(typeof TAB_ORDER)[number], string> = {
  Summary: 'Edit',
  JSON: 'JSON',
  Snapshot: 'Snapshot',
};

type Props = {
  profile: SupportedProfileStructureDefinition;
  resourceType: ResourceType;
  resource: Resource;
  id: string;
};
const ProfileDetail: React.FC<Props> = ({ profile, resourceType, id, resource }) => {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      console.log('handleSubmit', newResource);

      const cleanedResource = cleanResource(newResource);
      addProfileToResource(cleanedResource, profile.url);

      medplum
        .updateResource(cleanedResource)
        .then(() => {
          navigate(`/${resourceType}/${id}/details`);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        });
    },
    [medplum, navigate, resourceType, id, profile.url]
  );

  const handleDelete = useCallback(() => {
    navigate(`/${resourceType}/${id}/delete`);
  }, [navigate, resourceType, id]);

  return (
    <div>
      <Tabs defaultValue={TAB_ORDER[0]}>
        <Stack spacing="lg">
          <Tabs.List>
            {TAB_ORDER.map((tab) => (
              <Tabs.Tab key={tab} value={tab}>
                {TAB_NAMES[tab]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="Summary">
            <ResourceForm
              profileUrl={profile.url}
              defaultValue={resource}
              onSubmit={handleSubmit}
              onDelete={handleDelete}
              outcome={outcome}
            />
          </Tabs.Panel>
          <Tabs.Panel value="Snapshot">
            <Stack spacing="md">
              <Code block>{JSON.stringify(profile.snapshot, undefined, 4)}</Code>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="JSON">
            <Stack spacing="md">
              <Code block>{JSON.stringify(profile, undefined, 4)}</Code>
            </Stack>
          </Tabs.Panel>
        </Stack>
      </Tabs>
    </div>
  );
};

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// function pickKeys(obj: object, ...keys: string[]): object {
//   const result: any = {};
//   for (const key of keys) {
//     if (key in obj) {
//       result[key] = (obj as any)[key];
//     }
//   }
//   return result;
// }
