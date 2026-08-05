// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Grid, Group, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Meta } from '@storybook/react';
import type { JSX, ReactNode } from 'react';
import { Document } from '../Document/Document';
import { SubmitButton } from '../Form/SubmitButton';
import type { ModalProps } from './Modal';
import { Modal } from './Modal';

export default {
  title: 'Medplum/Modal',
  component: Modal,
} as Meta;

/**
 * Renders a trigger button next to the modal, since a modal is only interesting once opened.
 * @param props - The modal props, minus the disclosure state the wrapper owns.
 * @returns The story React node.
 */
function ModalStory(props: Omit<ModalProps, 'opened' | 'onClose'> & { readonly label?: string }): JSX.Element {
  const { label = 'Open modal', ...modalProps } = props;
  const [opened, { open, close }] = useDisclosure(false);
  return (
    <Document>
      <Button onClick={open}>{label}</Button>
      <Modal opened={opened} onClose={close} {...modalProps} />
    </Document>
  );
}

function bookmarkFields(): ReactNode {
  return (
    <Stack gap="md">
      <TextInput name="menuname" label="Menu" defaultValue="Favorites" />
      <TextInput name="bookmarkname" label="Bookmark name" defaultValue="Active patients" />
    </Stack>
  );
}

export const Basic = (): JSX.Element => (
  <ModalStory
    title="Assign Patient"
    size="md"
    actions={
      <>
        <Button>Assign Patient</Button>
        <Button variant="outline" color="red">
          Remove Assigned Patient
        </Button>
      </>
    }
  >
    <Text>Actions stretch to the full modal width, primary action first.</Text>
  </ModalStory>
);

export const WithForm = (): JSX.Element => (
  <ModalStory
    title="Add Bookmark"
    size="md"
    onSubmit={(formData) => console.log(formData)}
    actions={<SubmitButton>OK</SubmitButton>}
  >
    {bookmarkFields()}
  </ModalStory>
);

export const ButtonRow = (): JSX.Element => (
  <ModalStory
    title="Delete Task"
    size="md"
    actions={
      <Group justify="flex-end">
        <Button variant="outline">Cancel</Button>
        <Button color="red">Delete</Button>
      </Group>
    }
  >
    <Text>Wrapping the actions in a Group lays them out in a row; justify=&quot;flex-end&quot; right-aligns it.</Text>
  </ModalStory>
);

export const LongContent = (): JSX.Element => (
  <ModalStory title="Send Fax" size="lg" actions={<Button>Send Fax</Button>}>
    <Stack gap="md">
      {Array.from({ length: 20 }, (_unused, i) => (
        <TextInput key={`field-${i}`} label={`Field ${i + 1}`} placeholder="The body scrolls, the footer does not" />
      ))}
    </Stack>
  </ModalStory>
);

export const FixedBodyHeight = (): JSX.Element => (
  <ModalStory
    title="Edit Task"
    size="xl"
    bodyHeight="60vh"
    actions={
      <Group justify="flex-end">
        <Button>Save</Button>
      </Group>
    }
  >
    <Grid h="100%">
      <Grid.Col span={6}>
        <Stack gap="md">
          <TextInput label="Task" defaultValue="Review lab results" />
          <Textarea label="Description" minRows={4} autosize />
        </Stack>
      </Grid.Col>
      <Grid.Col span={6}>
        <Text c="dimmed">A fixed height holds the layout even when neither column fills it.</Text>
      </Grid.Col>
    </Grid>
  </ModalStory>
);

export const NoActions = (): JSX.Element => (
  <ModalStory title="Lab Results" size="80%">
    <Text>Content-only modals get no footer and no footer border.</Text>
  </ModalStory>
);

export const FlushBody = (): JSX.Element => (
  <ModalStory title="Prescription" size="xl" padding={0}>
    <iframe
      title="Prescription"
      srcDoc="<p>Embedded content, flush to the modal edges.</p>"
      width="100%"
      height={400}
    />
  </ModalStory>
);
