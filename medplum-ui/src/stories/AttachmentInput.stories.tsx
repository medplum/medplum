import { Meta } from '@storybook/react';
import { schema } from 'medplum';
import React from 'react';
import { AttachmentInput, AttachmentInputProps } from '../AttachmentInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AttachmentInput',
  component: AttachmentInput,
} as Meta;

export const Basic = (args: AttachmentInputProps) => (
  <Document>
    <AttachmentInput property={schema.Patient.properties.photo} />
  </Document>
);

export const DefaultValue = (args: AttachmentInputProps) => (
  <Document>
    <AttachmentInput property={schema.Patient.properties.address} value="Hello world" />
  </Document>
);
