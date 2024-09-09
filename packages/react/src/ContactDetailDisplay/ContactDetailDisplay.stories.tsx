import { ContactDetail } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ContactDetailDisplay } from './ContactDetailDisplay';

export default {
  title: 'Medplum/ContactDetailDisplay',
  component: ContactDetailDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ContactDetailDisplay value={{ name: 'Foo', telecom: [{ value: 'homer@example.com' }] } as ContactDetail} />
  </Document>
);
