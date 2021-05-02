import { Meta } from '@storybook/react';
import React from 'react';
import { TextField, TextFieldProps } from '../TextField';

export default {
  title: 'Medplum/TextField',
  component: TextField,
} as Meta;

export const Basic = (args: TextFieldProps) => (
  <TextField />
);

export const DefaultValue = (args: TextFieldProps) => (
  <TextField value="Hello world" />
);
