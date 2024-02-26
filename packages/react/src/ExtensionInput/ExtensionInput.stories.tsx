import { Extension } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ExtensionInput } from './ExtensionInput';

export default {
  title: 'Medplum/ExtensionInput',
  component: ExtensionInput,
} as Meta;

export const Basic = (): JSX.Element => (
  // https://www.hl7.org/fhir/extension-patient-interpreterrequired.html
  <Document>
    <ExtensionInput
      name="interpreterRequired"
      defaultValue={
        { url: 'http://hl7.org/fhir/StructureDefinition/patient-interpreterRequired', valueBoolean: true } as Extension
      }
      path="Patient.interpreterRequired"
      onChange={undefined}
      outcome={undefined}
      propertyType={{ code: 'Extension' }}
    />
  </Document>
);
