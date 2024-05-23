import { Range } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { RangeInput } from './RangeInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/RangeInput',
  component: RangeInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <RangeInput
      path=""
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

export const Disabled = (): JSX.Element => (
  <Document>
    <RangeInput
      disabled
      path=""
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

export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'SpecimenDefinition',
    elements: {},
    accessPolicyResource: {
      resourceType: 'SpecimenDefinition',
      readonlyFields: ['handling.temperatureRange.high'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <RangeInput
        path="SpecimenDefinition.handling.temperatureRange"
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
};
