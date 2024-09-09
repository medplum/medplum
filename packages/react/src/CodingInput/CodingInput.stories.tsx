import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { CodingInput } from './CodingInput';

export default {
  title: 'Medplum/CodingInput',
  component: CodingInput,
} as Meta;

const valueSet = 'http://hl7.org/fhir/ValueSet/marital-status';

export const Basic = (): JSX.Element => (
  <Document>
    <CodingInput path="" binding={valueSet} name="code" />
  </Document>
);

export const WithWrapperText = (): JSX.Element => (
  <Document>
    <CodingInput path="" binding={valueSet} name="code" label="My Label" description="My help text" />
  </Document>
);

export const WithError = (): JSX.Element => (
  <Document>
    <CodingInput path="" binding={valueSet} name="code" label="My Label" description="My help text" error="My error" />
  </Document>
);

export const MultipleValues = (): JSX.Element => (
  <Document>
    <CodingInput path="" binding={valueSet} name="code" label="Max Values 2" maxValues={2} />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <CodingInput
      path=""
      binding={valueSet}
      name="code"
      label="My Label"
      defaultValue={{ display: 'display' }}
      disabled
    />
  </Document>
);
