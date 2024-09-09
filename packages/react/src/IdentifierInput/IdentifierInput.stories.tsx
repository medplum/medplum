import { Identifier } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { IdentifierInput } from './IdentifierInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export default {
  title: 'Medplum/IdentifierInput',
  component: IdentifierInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <IdentifierInput
      name="patient-identifier"
      path="Patient.identifier"
      defaultValue={
        {
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '011-11-1234',
        } as Identifier
      }
      onChange={console.log}
      outcome={undefined}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <IdentifierInput
      disabled
      name="patient-identifier"
      path="Patient.identifier"
      defaultValue={
        {
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '011-11-1234',
        } as Identifier
      }
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
      readonlyFields: ['identifier.system'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <IdentifierInput
        name="patient-identifier"
        path="Patient.identifier"
        defaultValue={
          {
            system: 'http://hl7.org/fhir/sid/us-ssn',
            value: '011-11-1234',
          } as Identifier
        }
        onChange={console.log}
        outcome={undefined}
      />
    </Document>
  );
};
