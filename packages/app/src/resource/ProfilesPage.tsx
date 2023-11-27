import { OperationOutcome, Resource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Document,
  ProfileStructureDefinition,
  ResourceForm,
  isProfileStructureDefinition,
  useMedplum,
} from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import {
  ProfileSummary,
  deepClone,
  normalizeErrorString,
  normalizeOperationOutcome,
  validateResource,
} from '@medplum/core';
import { Anchor, Button, Code, Group, Stack, Tabs } from '@mantine/core';
import { cleanResource } from './utils';

const DO_ACTIONS = true;

export function ProfilesPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [resource, setResource] = useState<Resource | undefined>();
  const [currentProfile, setCurrentProfile] = useState<ProfileSummary>();
  const [profileSummaries, setProfileSummaries] = useState<ProfileSummary[]>();

  useEffect(() => {
    medplum
      .readResource(resourceType, id)
      .then((resource) => setResource(deepClone(resource)))
      .catch((err) => {
        // setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });
  }, [medplum, resourceType, id]);

  useEffect(() => {
    if (!resource?.meta?.profile) {
      return;
    }
    const profileUrls: string[] = resource.meta.profile;

    const promises: Promise<ProfileSummary[]>[] = [];
    for (const profileUrl of profileUrls) {
      promises.push(medplum.requestProfileSummary(profileUrl));
    }

    Promise.all(promises)
      .then((results) => {
        const profileSummaries = results.flat();
        setProfileSummaries(profileSummaries);
        if (profileSummaries.length > 0) {
          setCurrentProfile(profileSummaries[0]);
        }
      })
      .catch((reason) => {
        console.error(reason);
      });
  }, [medplum, resource]);

  if (!resource) {
    return null;
  }

  return (
    <>
      <Document>
        <h1>Profiles</h1>
        <Stack>
          {profileSummaries?.map((profile, idx) => (
            <ProfileListItem
              key={profile.url ?? idx}
              profile={profile}
              onSelect={() => {
                setCurrentProfile(profile);
              }}
            />
          ))}
          {currentProfile && (
            <ProfileDetail profileSummary={currentProfile} resourceType={resourceType} resource={resource} id={id} />
          )}
        </Stack>
      </Document>
    </>
  );
}

function ProfileListItem({ profile, onSelect }: { profile: ProfileSummary; onSelect: () => void }): JSX.Element {
  return (
    <Anchor onClick={onSelect}>
      {profile.title} - {profile.url}
    </Anchor>
  );
}

const tabs = ['Summary', 'Differential', 'Snapshot', 'JSON'];

type Props = {
  profileSummary: ProfileSummary;
  resourceType: ResourceType;
  resource: Resource;
  id: string;
};
const ProfileDetail: React.FC<Props> = ({ profileSummary: profileSummary, resourceType, id, resource }) => {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [profileSD, setProfileSD] = useState<ProfileStructureDefinition>();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [validationOutcome, _setValidationOutcome] = useState<OperationOutcome | undefined>();

  useEffect(() => {
    if (!profileSummary.url) {
      return;
    }

    const profilesQueryParmas = new URLSearchParams({ url: profileSummary.url });
    medplum
      .searchOne('StructureDefinition', profilesQueryParmas)
      .then((result) => {
        if (isProfileStructureDefinition(result)) {
          setProfileSD(result);
        } else {
          console.warn('Invalid Profile SD', result);
        }
      })
      .catch(console.error);
  }, [medplum, profileSummary.url]);

  function handleValidate(profile: StructureDefinition | undefined): void {
    validateResource(resource, profile);
  }

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      console.log('handleSubmit', newResource);
      if (DO_ACTIONS) {
        medplum
          .updateResource(cleanResource(newResource))
          .then(() => {
            navigate(`/${resourceType}/${id}/details`);
            showNotification({ color: 'green', message: 'Success' });
          })
          .catch((err) => {
            setOutcome(normalizeOperationOutcome(err));
            showNotification({ color: 'red', message: normalizeErrorString(err) });
          });
      }
    },
    [medplum, resourceType, id, navigate]
  );

  const handleDelete = useCallback(() => {
    console.log('handleDelete');
    if (DO_ACTIONS) {
      navigate(`/${resourceType}/${id}/delete`);
    }
  }, [navigate, resourceType, id]);

  return (
    <div>
      <Tabs defaultValue={tabs[0]}>
        <Stack spacing="lg">
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Tab key={tab} value={tab}>
                {tab}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="Summary">
            <Code block>
              {JSON.stringify(pickKeys(profileSummary, 'resourceType', 'id', 'name', 'url', 'title'), undefined, 4)}
            </Code>
            <Stack py="md" my="md">
              <Group>
                <Button onClick={() => handleValidate(undefined)} disabled={true}>
                  Validate Base
                </Button>
                <Button onClick={() => handleValidate(profileSummary)} disabled={true}>
                  Validate Profile
                </Button>
              </Group>
              {validationOutcome && <Code block>{JSON.stringify(validationOutcome, undefined, 4)}</Code>}
            </Stack>
            <ResourceForm
              profileUrl={profileSummary.url}
              defaultValue={resource}
              onSubmit={handleSubmit}
              onDelete={handleDelete}
              outcome={outcome}
            />
          </Tabs.Panel>
          <Tabs.Panel value="Differential">
            <Stack spacing="md">
              <Code fz="lg" fw={700}>
                profile.differential.element
              </Code>
              {profileSD && <Code block>{JSON.stringify(profileSD.differential?.element, undefined, 4)}</Code>}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="Snapshot">
            <Stack spacing="md">
              <Code fz="lg" fw={700}>
                profile.snapshot
              </Code>
              {profileSD && <Code block>{JSON.stringify(profileSD.snapshot, undefined, 4)}</Code>}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="JSON">
            <Stack spacing="md">{profileSD && <Code block>{JSON.stringify(profileSD, undefined, 4)}</Code>}</Stack>
          </Tabs.Panel>
        </Stack>
      </Tabs>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function pickKeys(obj: object, ...keys: string[]): object {
  const result: any = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = (obj as any)[key];
    }
  }
  return result;
}
