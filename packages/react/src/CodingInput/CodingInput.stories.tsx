import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { CodingInput } from './CodingInput';

export default {
  title: 'Medplum/CodingInput',
  component: CodingInput,
} as Meta;

const valueSet = 'http://hl7.org/fhir/ValueSet/marital-status';

export const Basic = (): JSX.Element => (
  <Document>
    <CodingInput binding={valueSet} name="code" />
  </Document>
);
