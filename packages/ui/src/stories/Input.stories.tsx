import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { Input } from '../Input';

export default {
  title: 'Medplum/Input',
  component: Input,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Input />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <Input defaultValue="Hello world" />
  </Document>
);
