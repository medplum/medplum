// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildElementsContext } from '@medplum/core';
import { ContactPoint } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { ContactPointInput } from './ContactPointInput';

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
