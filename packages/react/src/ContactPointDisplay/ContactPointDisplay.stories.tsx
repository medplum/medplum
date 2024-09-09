import { ContactPoint } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ContactPointDisplay } from './ContactPointDisplay';

export default {
  title: 'Medplum/ContactPointDisplay',
  component: ContactPointDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ContactPointDisplay value={{ use: 'home', system: 'email', value: 'homer@example.com' } as ContactPoint} />
  </Document>
);
