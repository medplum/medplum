import { Attachment } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { AttachmentDisplay } from './AttachmentDisplay';

export default {
  title: 'Medplum/AttachmentDisplay',
  component: AttachmentDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AttachmentDisplay value={{ url: 'http://example.com/file1', title: 'file1.txt' } as Attachment} />
  </Document>
);
