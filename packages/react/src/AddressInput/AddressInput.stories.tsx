import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { AddressInput } from './AddressInput';

export default {
  title: 'Medplum/AddressInput',
  component: AddressInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AddressInput name="address" path="Patient.address" onChange={undefined} outcome={undefined} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <AddressInput
      name="address"
      path="Patient.address"
      defaultValue={{
        use: 'home',
        type: 'physical',
        line: ['123 Happy St'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '44444',
      }}
      onChange={undefined}
      outcome={undefined}
    />
  </Document>
);
