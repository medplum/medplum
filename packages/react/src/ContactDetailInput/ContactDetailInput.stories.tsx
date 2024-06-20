import { ContactDetail } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ContactDetailInput } from './ContactDetailInput';
import { buildElementsContext } from '@medplum/core';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

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
