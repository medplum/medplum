import { ContactDetail } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
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
    />
  </Document>
);
