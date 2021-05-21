import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { TextField } from '../TextField';

export default {
  title: 'Medplum/TextField',
  component: TextField,
} as Meta;

export const Basic = () => (
  <Document>
    <TextField />
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <TextField value="Hello world" />
  </Document>
);

export const Small = () => (
  <Document>
    <TextField size="small" value="Small" />
  </Document>
);

export const Large = () => (
  <Document>
    <TextField size="large" value="Large" />
  </Document>
);
