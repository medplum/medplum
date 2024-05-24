import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { TimingInput } from './TimingInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/TimingInput',
  component: TimingInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <TimingInput name="demo" path="Extension.value[x]" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <TimingInput
      name="demo"
      path="Extension.value[x]"
      defaultValue={{
        repeat: {
          periodUnit: 'wk',
          dayOfWeek: ['mon', 'wed', 'fri'],
          timeOfDay: ['09:00:00', '12:00:00', '03:00:00'],
        },
      }}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <TimingInput
      disabled
      name="demo"
      path="Extension.value[x]"
      defaultValue={{
        repeat: {
          periodUnit: 'wk',
          dayOfWeek: ['mon', 'wed', 'fri'],
          timeOfDay: ['09:00:00', '12:00:00', '03:00:00'],
        },
      }}
    />
  </Document>
);

export const PartiallyDisabled = (): JSX.Element => {
  const context = buildElementsContext({
    parentContext: undefined,
    path: 'NutritionOrder',
    elements: {},
    accessPolicyResource: {
      resourceType: 'NutritionOrder',
      readonlyFields: [
        'oralDiet.schedule.event',
        'oralDiet.schedule.repeat.period',
        'oralDiet.schedule.repeat.dayOfWeek',
      ],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document h={500}>
      <TimingInput
        name="demo"
        path="NutritionOrder.oralDiet.schedule"
        defaultModalOpen
        defaultValue={{
          repeat: {
            periodUnit: 'wk',
            dayOfWeek: ['mon', 'wed', 'fri'],
            timeOfDay: ['09:00:00', '12:00:00', '03:00:00'],
          },
        }}
      />
    </Document>
  );
};
