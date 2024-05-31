import { ContactPoint } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ContactPointInput } from './ContactPointInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/ContactPointInput',
  component: ContactPointInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ContactPointInput
      name="test"
      path="Patient.contact"
      defaultValue={{ use: 'home', system: 'email', value: 'homer@example.com' } as ContactPoint}
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <ContactPointInput
      disabled
      name="test"
      path="Patient.contact"
      defaultValue={{ use: 'home', system: 'email', value: 'homer@example.com' } as ContactPoint}
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
      readonlyFields: ['contact.telecom.system', 'contact.telecom.value'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }
  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <ContactPointInput
        name="test"
        path="Patient.contact.telecom"
        defaultValue={{ use: 'home', system: 'email', value: 'homer@example.com' } as ContactPoint}
        onChange={console.log}
        outcome={undefined}
      />
    </Document>
  );
};
