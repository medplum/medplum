import { Box, Combobox, Group, Stack, useCombobox, Text, UnstyledButton, Code } from '@mantine/core';
import { isPopulated } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceTable, useResource } from '@medplum/react';
import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import classes from './DetailsPage.module.css';

export function DetailsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const [profileUrl, setProfileUrl] = useState<string>();

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const profileUrlOptions = useMemo(() => {
    if (!isPopulated(resource?.meta?.profile)) {
      return undefined;
    }

    return [
      <Combobox.Option value="" key="">
        None
      </Combobox.Option>,
      ...resource.meta.profile.map((p) => (
        <Combobox.Option value={p} key={p}>
          {p}
        </Combobox.Option>
      )),
    ];
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
      <Group justify="flex-end">
        <Stack align="flex-end" gap="xs">
          <Combobox
            store={combobox}
            width={250}
            position="bottom-end"
            withinPortal={false}
            onOptionSubmit={(val) => {
              setProfileUrl(val);
              combobox.closeDropdown();
            }}
          >
            <Combobox.Target>
              <UnstyledButton onClick={() => combobox.toggleDropdown()}>
                <Code fw="bold" fs="sm" className={classes.selectProfileBtn}>
                  <span>Pick profile</span>
                  <IconChevronDown stroke={1.5} className={classes.chevron} />
                </Code>
              </UnstyledButton>
            </Combobox.Target>

            <Combobox.Dropdown w="max-content">
              <Combobox.Options>{profileUrlOptions}</Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>

          <Box>
            {profileUrl ? (
              <>
                <Text span size="sm" c="dimmed">
                  Displaying profile:&nbsp;
                </Text>

                <Text span size="sm">
                  {profileUrl || 'Nothing selected'}
                </Text>
              </>
            ) : (
              <Text span size="sm" c="dimmed">
                No profile displayed
              </Text>
            )}
          </Box>
        </Stack>
      </Group>
    );
  }

  return (
    <Document>
      <Stack gap="xl">
        {profileSelect}
        <ResourceTable value={resource} profileUrl={profileUrl} />
      </Stack>
    </Document>
  );
}
