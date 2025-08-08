// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildElementsContext } from '@medplum/core';
import { Ratio } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { RatioInput } from './RatioInput';

export default {
  title: 'Medplum/RatioInput',
  component: RatioInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <RatioInput
      path=""
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

export const Disabled = (): JSX.Element => (
  <Document>
    <RatioInput
      disabled
      path=""
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
export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'Medication',
    elements: {},
    accessPolicyResource: {
      resourceType: 'Medication',
      readonlyFields: ['amount.denominator'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <RatioInput
        path="Medication.amount"
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
};
