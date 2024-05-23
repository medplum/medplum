import { Meta } from '@storybook/react';
import { AttachmentInput } from './AttachmentInput';
import { Document } from '../Document/Document';

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
