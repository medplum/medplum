import { Identifier } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { IdentifierDisplay } from './IdentifierDisplay';

export default {
  title: 'Medplum/IdentifierDisplay',
  component: IdentifierDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <IdentifierDisplay
      value={
        {
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '011-11-1234',
        } as Identifier
      }
    />
  </Document>
);
