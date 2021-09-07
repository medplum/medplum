import { Meta } from '@storybook/react';
import React from 'react';
import { AttachmentArrayInput } from '../AttachmentArrayInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AttachmentArrayInput',
  component: AttachmentArrayInput,
} as Meta;

export const Basic = () => (
  <Document>
    <AttachmentArrayInput name="photo" />
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <AttachmentArrayInput name="photo" defaultValue={[{}]} />
  </Document>
);
