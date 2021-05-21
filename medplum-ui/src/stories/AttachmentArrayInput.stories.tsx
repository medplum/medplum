import { Meta } from '@storybook/react';
import { schema } from 'medplum';
import React from 'react';
import { AttachmentArrayInput } from '../AttachmentArrayInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AttachmentArrayInput',
  component: AttachmentArrayInput,
} as Meta;

export const Basic = () => (
  <Document>
    <AttachmentArrayInput property={schema.Patient.properties.photo} name="photo" />
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <AttachmentArrayInput property={schema.Patient.properties.address} name="photo" values={[{}]} />
  </Document>
);
