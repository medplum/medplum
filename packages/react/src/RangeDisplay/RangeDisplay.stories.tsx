import { Range } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { RangeDisplay } from './RangeDisplay';

export default {
  title: 'Medplum/RangeDisplay',
  component: RangeDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <RangeDisplay
      value={
        {
          low: {
            value: 10,
            unit: 'mg',
          },
          high: {
            value: 11.2,
            unit: 'mg',
          },
        } as Range
      }
    />
  </Document>
);

export const HighOnly = (): JSX.Element => (
  <Document>
    <RangeDisplay
      value={
        {
          high: {
            value: 11.2,
            unit: 'mg',
          },
        } as Range
      }
    />
  </Document>
);

export const LowOnly = (): JSX.Element => (
  <Document>
    <RangeDisplay
      value={
        {
          low: {
            value: 10,
            unit: 'mg',
          },
        } as Range
      }
    />
  </Document>
);
