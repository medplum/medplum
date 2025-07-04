import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { SignatureInput } from './SignatureInput';

export default {
  title: 'Medplum/SignatureInput',
  component: SignatureInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <SignatureInput onChange={console.log} />
  </Document>
);
