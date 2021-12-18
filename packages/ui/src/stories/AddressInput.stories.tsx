import { Meta } from '@storybook/react';
import React from 'react';
import { AddressInput } from '../AddressInput';
import { Document } from '../Document';

export default {
  title: 'Medplum/AddressInput',
  component: AddressInput,
} as Meta;

export const Basic = () => (
  <Document>
    <AddressInput name="address" />
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <AddressInput
      name="address"
      defaultValue={{
        use: 'home',
        type: 'physical',
        line: ['123 Happy St'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '44444',
      }}
    />
  </Document>
);
