import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ValueSetAutocomplete } from './ValueSetAutocomplete';

export default {
  title: 'Medplum/ValueSetAutocomplete',
  component: ValueSetAutocomplete,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ValueSetAutocomplete binding="x" onChange={console.log} />
  </Document>
);
