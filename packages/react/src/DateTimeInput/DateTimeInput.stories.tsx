import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { DateTimeInput } from './DateTimeInput';

export default {
  title: 'Medplum/DateTimeInput',
  component: DateTimeInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <DateTimeInput name="demo" onChange={console.log} />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <DateTimeInput name="demo" onChange={console.log} disabled />
  </Document>
);
