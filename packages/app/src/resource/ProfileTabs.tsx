import { Tabs, ThemeIcon } from '@mantine/core';
import { Resource } from '@medplum/fhirtypes';
import { SupportedProfileStructureDefinition, isSupportedProfileStructureDefinition, useMedplum } from '@medplum/react';
import { IconCircleFilled } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

const PREFERRED_PROFILES = [
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure',
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
];

export type ProfileTabsProps = {
  resource: Resource;
  currentProfile: SupportedProfileStructureDefinition | undefined;
  onChange: (newProfile: SupportedProfileStructureDefinition) => void;
};

export function ProfileTabs({ resource, currentProfile, onChange }: ProfileTabsProps): JSX.Element {
  const resourceType = resource.resourceType;

  const medplum = useMedplum();
  const [availableProfiles, setAvailableProfiles] = useState<SupportedProfileStructureDefinition[]>();

  // This is a bit inefficient since the entire structure definition
  // for each available profile is being fetched. All that is really needed is the title & url
  // The SD is useful for the time being to populate the Snapshot and JSON debugging tabs;
  // but those will likely be removed before deploying
  useEffect(() => {
    medplum
      .searchResources('StructureDefinition', { type: resourceType, derivation: 'constraint', _count: 50 })
      .then((results) => {
        setAvailableProfiles(results.filter(isSupportedProfileStructureDefinition));

        const preferredSD = results
          .filter(isSupportedProfileStructureDefinition)
          .find((sd) => PREFERRED_PROFILES.includes(sd.url));
        if (preferredSD) {
          onChange(preferredSD);
        }
      })
      .catch(console.error);
  }, [medplum, onChange, resourceType]);
  return (
    <Tabs
      value={currentProfile?.url}
      onChange={(newProfileUrl) => {
        const newProfile = availableProfiles?.find((p) => p.url === newProfileUrl);
        if (newProfile) {
          onChange(newProfile);
        }
      }}
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
  );
}
