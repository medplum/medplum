import { Box, Button, Modal, Select, TextInput } from '@mantine/core';
import React from 'react';
import { Form } from '../Form/Form';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { UserConfiguration } from '@medplum/fhirtypes';
import { useLocation } from 'react-router-dom';
import { normalizeErrorString } from '@medplum/core';
import { showNotification } from '@mantine/notifications';

interface BookmarkDialogProps {
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
  defaultValue?: string;
}
export function BookmarkDialog(props: BookmarkDialogProps): JSX.Element | null {
  const medplum = useMedplum();
  const config = medplum.getUserConfiguration() as UserConfiguration;
  const location = useLocation();
  function submitHandler(formData: Record<string, string>): void {
    const { menuname, bookmarkname: name } = formData;
    const target = location.pathname + location.search;
    const menu = config?.menu?.find(({ title }) => title === menuname);

    if (menu) {
      menu?.link?.push({ name, target });
    }

    if (config?.id) {
      medplum
        .updateResource(config)
        .then(async () => {
          await medplum.refreshProfile();
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err: any) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    } else {
      medplum
        .createResource(config)
        .then(() => showNotification({ color: 'green', message: 'Success' }))
        .catch((err: any) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    }
    props.onOk();
    props.onCancel();
  }

  return (
    <Modal
      title="Add Bookmark"
      closeButtonProps={{ 'aria-label': 'Close' }}
      opened={props.visible}
      onClose={props.onCancel}
    >
      <Box display="flex" sx={{ justifyContent: 'space-between' }}>
        <Form onSubmit={submitHandler}>
          <SelectMenu config={config}></SelectMenu>
          <TextInput label="Bookmark Name" type="text" name="bookmarkname" placeholder="bookmark name" withAsterisk />
          <Button type="submit">Save</Button>
        </Form>
      </Box>
    </Modal>
  );
}

interface SelectMenuProps {
  config: UserConfiguration | undefined;
}
function SelectMenu(props: SelectMenuProps): JSX.Element {
  function userConfigToMenu(config: UserConfiguration | undefined): [] {
    return config?.menu?.map((menu) => menu.title) as [];
  }
  return (
    <Select
      name="menuname"
      label="Select Menu Option"
      placeholder="Menu"
      data={userConfigToMenu(props.config)}
      withAsterisk
    />
  );
}
