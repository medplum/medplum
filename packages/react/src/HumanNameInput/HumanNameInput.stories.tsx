import { HumanName } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { HumanNameInput } from './HumanNameInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/HumanNameInput',
  component: HumanNameInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <HumanNameInput
      name="patient-name"
      path="Patient.name"
      defaultValue={{ prefix: ['Mr.'], given: ['Homer', 'J.'], family: 'Simpson' } as HumanName}
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <HumanNameInput
      disabled
      name="patient-name"
      path="Patient.name"
      defaultValue={{ prefix: ['Mr.'], given: ['Homer', 'J.'], family: 'Simpson' } as HumanName}
      onChange={console.log}
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
      readonlyFields: ['name.use', 'name.given', 'name.suffix'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <HumanNameInput
        name="patient-name"
        path="Patient.name"
        defaultValue={{ prefix: ['Mr.'], given: ['Homer', 'J.'], family: 'Simpson' } as HumanName}
        onChange={console.log}
        outcome={undefined}
      />
    </Document>
  );
};
