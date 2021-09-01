import { Meta } from '@storybook/react';
import React from 'react';
import { AttachmentInput } from '../AttachmentInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AttachmentInput',
  component: AttachmentInput,
} as Meta;

export const Basic = () => (
  <Document>
    <AttachmentInput name="attachment" />
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <AttachmentInput name="attachment" defaultValue={{}} />
  </Document>
);
