import { Meta } from '@storybook/react';
import { schema } from 'medplum';
import React from 'react';
import { AttachmentArray, AttachmentArrayProps } from '../AttachmentArray';
import { Document } from '../Document';

export default {
  title: 'Medplum/AttachmentArray',
  component: AttachmentArray,
} as Meta;

export const Basic = (args: AttachmentArrayProps) => (
  <Document>
    <AttachmentArray property={schema.Patient.properties.photo} />
  </Document>
);

export const DefaultValue = (args: AttachmentArrayProps) => (
  <Document>
    <AttachmentArray property={schema.Patient.properties.address} values={[{}]} />
  </Document>
);
