import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { UserConfiguration } from '@medplum/fhirtypes';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { Form } from '../Form/Form';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

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

    medplum
      .updateResource(config)
      .then(async () => {
        medplum.dispatchEvent({ type: 'change' });
        showNotification({ color: 'green', message: 'Success' });
        props.onOk();
      })
      .catch((err: any) => {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      });
  }

  return (
    <Modal
      title="Add Bookmark"
      closeButtonProps={{ 'aria-label': 'Close' }}
      opened={props.visible}
      onClose={props.onCancel}
    >
      <Form onSubmit={submitHandler}>
        <Stack>
          <SelectMenu config={config}></SelectMenu>
          <TextInput label="Bookmark Name" type="text" name="bookmarkname" placeholder="bookmark name" withAsterisk />
          <Group position="right">
            <Button mt="sm" type="submit">
              OK
            </Button>
          </Group>
        </Stack>
      </Form>
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
