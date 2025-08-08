// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildElementsContext } from '@medplum/core';
import { ContactDetail } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { ContactDetailInput } from './ContactDetailInput';

export default {
  title: 'Medplum/ContactDetailInput',
  component: ContactDetailInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ContactDetailInput
      defaultValue={
        {
          name: 'Foo',
          telecom: [
            {
              use: 'home',
              system: 'email',
              value: 'abc@example.com',
            },
          ],
        } as ContactDetail
      }
      onChange={console.log}
      name="contact"
      path="Patient.contact"
      outcome={undefined}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <ContactDetailInput
      disabled
      defaultValue={
        {
          name: 'Foo',
          telecom: [
            {
              use: 'home',
              system: 'email',
              value: 'abc@example.com',
            },
          ],
        } as ContactDetail
      }
      onChange={console.log}
      name="contact"
      path="Patient.contact"
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
      readonlyFields: ['contact.telecom.use', 'contact.name'],
    },
  });
  if (!context) {
    return <div>Context unexpectedly undefined</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    context,
    <Document>
      <ContactDetailInput
        defaultValue={
          {
            name: 'Foo',
            telecom: [
              {
                use: 'home',
                system: 'email',
                value: 'abc@example.com',
              },
            ],
          } as ContactDetail
        }
        onChange={console.log}
        name="contact"
        path="Patient.contact"
        outcome={undefined}
      />
    </Document>
  );
};
