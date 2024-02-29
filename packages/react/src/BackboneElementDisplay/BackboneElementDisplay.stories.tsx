import { PatientContact } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { BackboneElementDisplay } from './BackboneElementDisplay';

export default {
  title: 'Medplum/BackboneElementDisplay',
  component: BackboneElementDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <BackboneElementDisplay
      path="Patient.contact"
      value={{
        type: 'PatientContact',
        value: {
          id: '123',
          name: {
            given: ['John'],
            family: 'Doe',
          },
        } as PatientContact,
      }}
    />
  </Document>
);

export const IgnoreMissingValues = (): JSX.Element => (
  <Document>
    <BackboneElementDisplay
      path="Patient.contact"
      value={{
        type: 'PatientContact',
        value: {
          id: '123',
          name: {
            given: ['John'],
            family: 'Doe',
          },
        },
      }}
      ignoreMissingValues
    />
  </Document>
);
