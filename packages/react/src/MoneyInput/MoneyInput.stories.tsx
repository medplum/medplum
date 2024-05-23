import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { MoneyInput } from './MoneyInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/MoneyInput',
  component: MoneyInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <MoneyInput path="" name="demo" onChange={console.log} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <MoneyInput path="" name="demo" onChange={console.log} defaultValue={{ value: 101.55, currency: 'USD' }} />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <MoneyInput disabled path="" name="demo" onChange={console.log} defaultValue={{ value: 101.55, currency: 'USD' }} />
  </Document>
);

export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'Claim',
    elements: {},
    accessPolicyResource: {
      resourceType: 'Claim',
      readonlyFields: ['total.currency'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <MoneyInput
        path="Claim.total"
        name="demo"
        onChange={console.log}
        defaultValue={{ value: 101.55, currency: 'USD' }}
      />
    </Document>
  );
};
