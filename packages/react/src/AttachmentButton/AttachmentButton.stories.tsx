import { ActionIcon, Button } from '@mantine/core';
import { Meta } from '@storybook/react';
import { IconCloudUpload } from '@tabler/icons-react';
import { Document } from '../Document/Document';
import { AttachmentButton } from './AttachmentButton';

export default {
  title: 'Medplum/AttachmentButton',
  component: AttachmentButton,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>Upload</Button>}</AttachmentButton>
  </Document>
);

export const CustomText = (): JSX.Element => (
  <Document>
    <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>My text</Button>}</AttachmentButton>
  </Document>
);

export const CustomComponent = (): JSX.Element => (
  <Document>
    <AttachmentButton onUpload={console.log}>
      {(props) => (
        <ActionIcon {...props} variant="filled">
          <IconCloudUpload size={16} />
        </ActionIcon>
      )}
    </AttachmentButton>
  </Document>
);
