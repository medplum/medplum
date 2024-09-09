import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { PeriodInput } from './PeriodInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/PeriodInput',
  component: PeriodInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <PeriodInput path="" name="demo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <PeriodInput
      path=""
      name="demo"
      defaultValue={{
        start: '2021-12-01T00:00:00.000Z',
        end: '2021-12-05T00:00:00.000Z',
      }}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <PeriodInput
      disabled
      path=""
      name="demo"
      defaultValue={{
        start: '2021-12-01T00:00:00.000Z',
        end: '2021-12-05T00:00:00.000Z',
      }}
    />
  </Document>
);

export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'Claim',
    elements: {},
    accessPolicyResource: {
      resourceType: 'Claim',
      readonlyFields: ['billablePeriod.end'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <PeriodInput
        path="Claim.billablePeriod"
        name="demo"
        defaultValue={{
          start: '2021-12-01T00:00:00.000Z',
          end: '2021-12-05T00:00:00.000Z',
        }}
      />
    </Document>
  );
};
