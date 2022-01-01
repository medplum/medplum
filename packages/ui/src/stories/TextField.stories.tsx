import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { TextField } from '../TextField';

export default {
  title: 'Medplum/TextField',
  component: TextField,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <TextField />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <TextField defaultValue="Hello world" />
  </Document>
);

export const Small = (): JSX.Element => (
  <Document>
    <TextField size="small" defaultValue="Small" />
  </Document>
);

export const Large = (): JSX.Element => (
  <Document>
    <TextField size="large" defaultValue="Large" />
  </Document>
);
