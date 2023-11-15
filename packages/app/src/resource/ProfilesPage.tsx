import { OperationOutcome, Resource, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import React, { useCallback, useEffect, useState } from 'react';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import { deepClone, isEmpty, normalizeErrorString, normalizeOperationOutcome, validateResource } from '@medplum/core';
import { Anchor, Button, Code, Group, Stack, Tabs } from '@mantine/core';
import { cleanResource } from './utils';

const DO_ACTIONS = false;

type ProfileStructureDefinition = StructureDefinition & { url: string; name: string };
function isProfileStructureDefinition(profile: StructureDefinition): profile is ProfileStructureDefinition {
  return !isEmpty(profile.url) && !isEmpty(profile.name);
}

export function ProfilesPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const [resource, setResource] = useState<Resource | undefined>();
  const [profileSchemaLoaded, _setProfileSchemaLoaded] = useState(false);
  const [baseSchemaLoaded, _setBaseSchemaLoaded] = useState(false);
  const [profiles, setProfiles] = useState<ProfileStructureDefinition[] | undefined>();
  const [currentProfile, setCurrentProfile] = useState<ProfileStructureDefinition | undefined>();

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
    const profileUrls = resource?.meta?.profile;

    if (!profileUrls) {
      return;
    }

    // _count=20&_fields=id,_lastUpdated,name,url,version&_offset=0&_sort=-version&url=http%3A%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FStructureDefinition%2Fus-core-patient
    // _sort=-version&url=http%3A%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FStructureDefinition%2Fus-core-patient
    const profilesQuery = new URLSearchParams([
      ...profileUrls.map((u) => ['url', u]),
      ['_count', '1'],
      ['_sort', '_lastUpdated'],
    ]);
    medplum
      .searchResources('StructureDefinition', profilesQuery)
      .then((results) => {
        // for (const profile of results) {
        //   console.log(profile);
        // }
        const profileSDs: ProfileStructureDefinition[] = [];
        for (const result of results) {
          if (isProfileStructureDefinition(result)) {
            profileSDs.push(result);
          } else {
            console.log('Invalid Profile SD', result);
          }
        }
        setProfiles(profileSDs);
        if (profileSDs.length > 0) {
          setCurrentProfile(profileSDs[0]);
        }
      })
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });

    // medplum
    //   .requestSchema(resource.resourceType)
    //   .then(() => {
    //     _setBaseSchemaLoaded(true);
    //   })
    //   .catch((err) => {
    //     showNotification({ color: 'red', message: normalizeErrorString(err) });
    //   });
  }, [medplum, resource]);

  useEffect(() => {
    if (!currentProfile) {
      return;
    }

    if (!currentProfile.url) {
      console.error('currentProfile.url is missing');
    } else {
      // medplum
      //   .requestProfileSchema(currentProfile.url)
      //   .then(() => {
      //     _setProfileSchemaLoaded(true);
      //   })
      //   .catch((err) => {
      //     showNotification({ color: 'red', message: normalizeErrorString(err) });
      //   });
    }
  }, [medplum, currentProfile]);

  // useEffect(() => {
  //   if (!profiles) {
  //     return;
  //   }

  //   const promises = [];
  //   for (const profile of profiles) {
  //     console.log(profile);
  //     const promise = medplum.readResource(profile.resourceType, profile.url);
  //     promises.push(promise);
  //   }
  // }, [medplum, profiles]);

  if (!resource) {
    return null;
  }

  return (
    <>
      <Document>
        <h1>Profiles</h1>
        {/*<h2>
          {resourceType}:{id}
        </h2>
  <h3>resource.meta.profile: {resource.meta?.profile}</h3>*/}

        <Stack>
          {profiles?.map((profile, idx) => (
            <ProfileSummary
              key={profile.url ?? idx}
              profile={profile}
              onSelect={() => {
                setCurrentProfile(profile);
              }}
            />
          ))}
          {currentProfile && (
            <ProfileDetail
              profile={currentProfile}
              resourceType={resourceType}
              resource={resource}
              id={id}
              baseSchemaLoaded={baseSchemaLoaded}
              profileSchemaLoaded={profileSchemaLoaded}
            />
          )}
        </Stack>
      </Document>
    </>
  );
}

function ProfileSummary({ profile, onSelect }: { profile: StructureDefinition; onSelect: () => void }): JSX.Element {
  return (
    <Anchor onClick={onSelect}>
      {profile.title} - {profile.url}
    </Anchor>
  );
}

const tabs = ['Summary', 'Differential', 'Snapshot', 'JSON'];

type Props = {
  profile: ProfileStructureDefinition;
  resourceType: ResourceType;
  resource: Resource;
  id: string;
  baseSchemaLoaded: boolean;
  profileSchemaLoaded: boolean;
};
const ProfileDetail: React.FC<Props> = ({
  profile,
  resourceType,
  id,
  resource,
  baseSchemaLoaded,
  profileSchemaLoaded,
}) => {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [validationOutcome, _setValidationOutcome] = useState<OperationOutcome | undefined>();
  const schemaName = profile.name;

  function handleValidate(profile: StructureDefinition | undefined): void {
    validateResource(resource, profile);
  }

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      //setOutcome(undefined);
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
              {JSON.stringify(pickKeys(profile, 'resourceType', 'id', 'name', 'url', 'title'), undefined, 4)}
            </Code>
            <Stack py="md" my="md">
              <Group>
                <Button onClick={() => handleValidate(undefined)} disabled={!baseSchemaLoaded}>
                  Validate Base
                </Button>
                <Button onClick={() => handleValidate(profile)} disabled={!profileSchemaLoaded || !profile}>
                  Validate Profile
                </Button>
              </Group>
              {validationOutcome && <Code block>{JSON.stringify(validationOutcome, undefined, 4)}</Code>}
            </Stack>
            <ResourceForm
              schemaName={schemaName}
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
              <Code block>{JSON.stringify(profile.differential?.element, undefined, 4)}</Code>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="Snapshot">
            <Stack spacing="md">
              <Code fz="lg" fw={700}>
                profile.snapshot
              </Code>
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
