import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { MoneyInput } from './MoneyInput';

export default {
  title: 'Medplum/MoneyInput',
  component: MoneyInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <MoneyInput name="foo" onChange={console.log} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <MoneyInput name="foo" onChange={console.log} defaultValue={{ value: 101.55, currency: 'USD' }} />
  </Document>
);
