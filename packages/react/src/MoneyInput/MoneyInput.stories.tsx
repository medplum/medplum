// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildElementsContext } from '@medplum/core';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { MoneyInput } from './MoneyInput';

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
