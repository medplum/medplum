// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildElementsContext } from '@medplum/core';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { QuantityInput } from './QuantityInput';

export default {
  title: 'Medplum/QuantityInput',
  component: QuantityInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <QuantityInput path="" name="demo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <QuantityInput
      path=""
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
      path=""
      name="demo"
      disableWheel
      defaultValue={{
        value: 2.2,
        unit: 'ng',
      }}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <QuantityInput
      disabled
      path=""
      name="demo"
      defaultValue={{
        value: 10,
        comparator: '<',
        unit: 'mg',
      }}
    />
  </Document>
);

export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'MolecularSequence',
    elements: {},
    accessPolicyResource: {
      resourceType: 'MolecularSequence',
      readonlyFields: ['quantity.comparator', 'quantity.unit'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <QuantityInput
        path="MolecularSequence.quantity"
        name="demo"
        defaultValue={{
          value: 10,
          comparator: '<',
          unit: 'mg',
        }}
      />
    </Document>
  );
};
