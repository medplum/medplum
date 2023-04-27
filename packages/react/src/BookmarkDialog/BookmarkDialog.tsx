import { Box, Button, Input, Modal } from '@mantine/core';
import React from 'react';
import { Form } from '../Form/Form';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

interface bookmarkDialog {
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
  defaultValue?: string;
}
export function BookmarkDialog(props: bookmarkDialog): JSX.Element | null {
  const medplum = useMedplum();

  function submitHandler(formData: Record<string, string>): void {
    console.log(formData);
    addBookmark(formData.bookmarkname);
    props.onOk();
    props.onCancel();
  }

  function addBookmark(value: string): void {
    console.log('adding bookmark', value);
    medplum
      .updateResource({
        resourceType: 'Patient',
        id: '123',
        name: [
          {
            family: value,
            given: ['John'],
          },
        ],
      })
      .then((response) => {
        console.log(response);
      })
      .catch((error) => {
        console.log(error);
      });
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
          <Input name="bookmarkname" placeholder="bookmark name" />
          <Button type="submit">Save</Button>
        </Form>
      </Box>
    </Modal>
  );
}
