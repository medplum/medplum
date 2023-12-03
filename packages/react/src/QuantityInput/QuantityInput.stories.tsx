import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { QuantityInput } from './QuantityInput';

export default {
  title: 'Medplum/QuantityInput',
  component: QuantityInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <QuantityInput name="demo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <QuantityInput
      name="demo"
      defaultValue={{
        value: 10,
        comparator: '<',
        unit: 'mg',
      }}
    />
  </Document>
);

export const ScrollWheelDisabled = (): JSX.Element => (
  <Document>
    <QuantityInput
      name="demo"
      disableWheel
      defaultValue={{
        value: 2.2,
        unit: 'ng',
      }}
    />
  </Document>
);
