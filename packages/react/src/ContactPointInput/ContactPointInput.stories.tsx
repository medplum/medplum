import { ContactPoint } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ContactPointInput } from './ContactPointInput';

export default {
  title: 'Medplum/ContactPointInput',
  component: ContactPointInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ContactPointInput
      name="test"
      defaultValue={{ use: 'home', system: 'email', value: 'homer@example.com' } as ContactPoint}
      onChange={console.log}
    />
  </Document>
);
