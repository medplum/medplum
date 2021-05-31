import { Meta } from '@storybook/react';
import React from 'react';
import { AddressInput, AddressInputProps } from '../AddressInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AddressInput',
  component: AddressInput,
} as Meta;

export const Basic = (args: AddressInputProps) => (
  <Document>
    <AddressInput name="address" />
  </Document>
);

export const DefaultValue = (args: AddressInputProps) => (
  <Document>
    <AddressInput name="address" value={{
      use: 'home',
      type: 'physical',
      line: ['123 Happy St'],
      city: 'Springfield',
      state: 'IL',
      postalCode: '44444'
    }} />
  </Document>
);
