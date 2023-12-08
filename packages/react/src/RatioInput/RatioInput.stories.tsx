import { Ratio } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { RatioInput } from './RatioInput';

export default {
  title: 'Medplum/RatioInput',
  component: RatioInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <RatioInput
      name="dosage"
      defaultValue={
        {
          numerator: { value: 10, unit: 'mg', system: 'http://unitsofmeasure.org' },
          denominator: { value: 1, unit: 'h', system: 'http://unitsofmeasure.org' },
        } as Ratio
      }
    />
  </Document>
);
