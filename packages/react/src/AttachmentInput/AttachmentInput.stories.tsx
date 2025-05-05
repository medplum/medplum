import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { AttachmentInput } from './AttachmentInput';

export default {
  title: 'Medplum/AttachmentInput',
  component: AttachmentInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AttachmentInput path="" name="attachment" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <AttachmentInput path="" name="attachment" defaultValue={{}} />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <AttachmentInput path="" name="attachment" defaultValue={{}} disabled />
  </Document>
);
