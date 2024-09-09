import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { AddressDisplay } from './AddressDisplay';

export default {
  title: 'Medplum/AddressDisplay',
  component: AddressDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AddressDisplay value={HomerSimpson.address?.[0]} />
  </Document>
);
