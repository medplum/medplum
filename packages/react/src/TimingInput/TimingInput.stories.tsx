import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { TimingInput } from './TimingInput';

export default {
  title: 'Medplum/TimingInput',
  component: TimingInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <TimingInput name="demo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <TimingInput
      name="demo"
      defaultValue={{
        repeat: {
          periodUnit: 'wk',
          dayOfWeek: ['mon', 'wed', 'fri'],
          timeOfDay: ['09:00:00', '12:00:00', '03:00:00'],
        },
      }}
    />
  </Document>
);
