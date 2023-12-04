import { Range } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { RangeInput } from './RangeInput';

export default {
  title: 'Medplum/RangeInput',
  component: RangeInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <RangeInput
      name="range"
      defaultValue={
        {
          low: {
            comparator: '>',
            value: 10,
            unit: 'mg',
          },
        } as Range
      }
    />
  </Document>
);
