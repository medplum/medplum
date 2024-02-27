import { ComboboxItem, Group, NativeSelect, Stack } from '@mantine/core';
import { isPopulated } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceTable, useResource } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

export function DetailsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const [profileUrl, setProfileUrl] = useState<string | undefined>();

  const profileUrlOptions: ComboboxItem[] | undefined = useMemo(() => {
    if (!isPopulated(resource?.meta?.profile)) {
      return undefined;
    }

    return [{ label: 'none', value: '' }, ...resource.meta.profile.map((p) => ({ label: p, value: p }))];
  }, [resource?.meta?.profile]);

  useEffect(() => {
    if (resource?.meta?.profile?.length === 1) {
      setProfileUrl(resource.meta.profile[0]);
    }
  }, [resource?.meta?.profile]);

  if (!resource) {
    return null;
  }

  let profileSelect: JSX.Element | undefined;
  if (isPopulated(profileUrlOptions)) {
    profileSelect = (
      <div style={{ maxWidth: 600 }}>
        <NativeSelect
          label="Profile to display"
          data={profileUrlOptions}
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.currentTarget.value || undefined)} // coalesce empty string to undefined
        />
      </div>
    );
  }

  return (
    <Document>
      <Stack gap="xl">
        <Group justify="flex-end">{profileSelect}</Group>
        <ResourceTable value={resource} profileUrl={profileUrl} />
      </Stack>
    </Document>
  );
}
