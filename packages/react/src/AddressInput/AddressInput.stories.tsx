import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { AddressInput } from './AddressInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { buildElementsContext } from '@medplum/core';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/AddressInput',
  component: AddressInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AddressInput name="address" path="Patient.address" onChange={undefined} outcome={undefined} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <AddressInput
      name="address"
      path="Patient.address"
      defaultValue={{
        use: 'home',
        type: 'physical',
        line: ['123 Happy St'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '44444',
      }}
      onChange={undefined}
      outcome={undefined}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <AddressInput
      name="address"
      path="Patient.address"
      disabled={true}
      defaultValue={{
        use: 'home',
        type: 'physical',
        line: ['123 Happy St'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '44444',
      }}
      onChange={undefined}
      outcome={undefined}
    />
  </Document>
);

export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'Patient',
    elements: {},
    accessPolicyResource: {
      resourceType: 'Patient',
      readonlyFields: ['address.type', 'address.city', 'address.postalCode'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <AddressInput
        name="address"
        path="Patient.address"
        defaultValue={{
          use: 'home',
          type: 'physical',
          line: ['123 Happy St'],
          city: 'Springfield',
          state: 'IL',
          postalCode: '44444',
        }}
        onChange={undefined}
        outcome={undefined}
      />
    </Document>
  );
};
