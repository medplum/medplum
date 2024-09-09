import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { QuantityDisplay } from './QuantityDisplay';

export default {
  title: 'Medplum/QuantityDisplay',
  component: QuantityDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <QuantityDisplay
      value={{
        value: 10,
        comparator: '<',
        unit: 'mg',
      }}
    />
  </Document>
);
