import { Meta } from '@storybook/react';
import React from 'react';
import { AttachmentInput, AttachmentInputProps } from '../AttachmentInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AttachmentInput',
  component: AttachmentInput,
} as Meta;

export const Basic = (args: AttachmentInputProps) => (
  <Document>
    <AttachmentInput name="attachment" />
  </Document>
);

export const DefaultValue = (args: AttachmentInputProps) => (
  <Document>
    <AttachmentInput name="attachment" value={{ }} />
  </Document>
);
