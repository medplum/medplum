import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { CodeInput } from './CodeInput';

export default {
  title: 'Medplum/CodeInput',
  component: CodeInput,
} as Meta;

const valueSet = 'http://hl7.org/fhir/ValueSet/marital-status';

export const Basic = (): JSX.Element => (
  <Document>
    <CodeInput name="foo" binding={valueSet} onChange={console.log} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <CodeInput name="foo" binding={valueSet} defaultValue="bots" onChange={console.log} />
  </Document>
);
