import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { TextField, TextFieldProps } from '../TextField';

export default {
  title: 'Medplum/TextField',
  component: TextField,
} as Meta;

export const Basic = (args: TextFieldProps) => (
  <Document>
    <TextField />
  </Document>
);

export const DefaultValue = (args: TextFieldProps) => (
  <Document>
    <TextField value="Hello world" />
  </Document>
);
