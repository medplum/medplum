import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { PeriodInput } from './PeriodInput';

export default {
  title: 'Medplum/PeriodInput',
  component: PeriodInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <PeriodInput name="demo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <PeriodInput
      name="demo"
      defaultValue={{
        start: '2021-12-01T00:00:00.000Z',
        end: '2021-12-05T00:00:00.000Z',
      }}
    />
  </Document>
);
