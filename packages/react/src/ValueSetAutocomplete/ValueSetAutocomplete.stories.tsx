import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ValueSetAutocomplete } from './ValueSetAutocomplete';

export default {
  title: 'Medplum/ValueSetAutocomplete',
  component: ValueSetAutocomplete,
} as Meta;

export const Single = (): JSX.Element => (
  <Document>
    <ValueSetAutocomplete binding="x" onChange={console.log} maxValues={1} />
  </Document>
);

export const Multiple = (): JSX.Element => (
  <Document>
    <ValueSetAutocomplete binding="x" onChange={console.log} maxValues={3} />
  </Document>
);
