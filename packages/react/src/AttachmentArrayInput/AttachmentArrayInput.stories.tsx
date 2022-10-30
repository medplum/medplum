import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { AttachmentArrayInput } from './AttachmentArrayInput';

export default {
  title: 'Medplum/AttachmentArrayInput',
  component: AttachmentArrayInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AttachmentArrayInput name="photo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <AttachmentArrayInput name="photo" defaultValue={[{}]} />
  </Document>
);
