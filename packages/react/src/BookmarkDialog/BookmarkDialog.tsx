import { Box, Button, Modal, Select, TextInput } from '@mantine/core';
import React from 'react';
import { Form } from '../Form/Form';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { UserConfiguration } from '@medplum/fhirtypes';
import { useLocation } from 'react-router-dom';

interface bookmarkDialog {
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
  defaultValue?: string;
}
export function BookmarkDialog(props: bookmarkDialog): JSX.Element | null {
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
        .then((response) => {
          console.log(response);
        })
        .catch((error) => {
          console.log(error);
        });
    } else {
      medplum
        .createResource(config)
        .then((response) => console.log('success!!!', response))
        .catch((error) => console.log(error));
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

interface selectMenuProps {
  config: UserConfiguration | undefined;
}
function SelectMenu(props: selectMenuProps): JSX.Element {
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
