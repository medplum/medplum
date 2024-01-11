import { Identifier } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { IdentifierInput } from './IdentifierInput';

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
