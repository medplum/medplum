import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { CodeableConceptInput } from './CodeableConceptInput';

export default {
  title: 'Medplum/CodeableConceptInput',
  component: CodeableConceptInput,
} as Meta;

const valueSet = 'http://hl7.org/fhir/ValueSet/marital-status';

export const Basic = (): JSX.Element => (
  <Document>
    <CodeableConceptInput
      name="foo"
      binding={valueSet}
      onChange={console.log}
      path="Resource.blank"
      outcome={undefined}
    />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <CodeableConceptInput
      name="foo"
      binding={valueSet}
      defaultValue={{ coding: [{ code: 'M', display: 'Married' }] }}
      onChange={console.log}
      path={'Patient.maritalStatus'}
      outcome={undefined}
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <CodeableConceptInput
      disabled
      name="foo"
      binding={valueSet}
      defaultValue={{ coding: [{ code: 'M', display: 'Married' }] }}
      onChange={console.log}
      path={'Patient.maritalStatus'}
      outcome={undefined}
    />
  </Document>
);
