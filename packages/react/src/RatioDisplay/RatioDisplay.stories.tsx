import { Ratio } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { RatioDisplay } from './RatioDisplay';

export default {
  title: 'Medplum/RatioDisplay',
  component: RatioDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <RatioDisplay
      value={
        {
          numerator: { value: 10, unit: 'mg', system: 'http://unitsofmeasure.org' },
          denominator: { value: 1, unit: 'h', system: 'http://unitsofmeasure.org' },
        } as Ratio
      }
    />
  </Document>
);
