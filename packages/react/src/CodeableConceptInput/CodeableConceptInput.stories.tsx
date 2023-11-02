import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { CodeableConceptInput } from './CodeableConceptInput';

export default {
  title: 'Medplum/CodeableConceptInput',
  component: CodeableConceptInput,
} as Meta;

const valueSet = 'http://hl7.org/fhir/ValueSet/marital-status';

export const Basic = (): JSX.Element => (
  <Document>
    <CodeableConceptInput name="foo" binding={valueSet} onChange={console.log} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <CodeableConceptInput
      name="foo"
      binding={valueSet}
      defaultValue={{ coding: [{ code: 'M', display: 'Married' }] }}
      onChange={console.log}
    />
  </Document>
);
