import { Meta } from '@storybook/react';
import { schema } from 'medplum';
import React from 'react';
import { AddressInput, AddressInputProps } from '../AddressInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AddressInput',
  component: AddressInput,
} as Meta;

export const Basic = (args: AddressInputProps) => (
  <Document>
    <AddressInput property={schema.Patient.properties.address} />
  </Document>
);

export const DefaultValue = (args: AddressInputProps) => (
  <Document>
    <AddressInput property={schema.Patient.properties.address} value="Hello world" />
  </Document>
);
