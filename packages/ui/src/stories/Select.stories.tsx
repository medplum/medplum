import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { Select } from '../TextField';

export default {
  title: 'Medplum/Select',
  component: Select,
} as Meta;

export const Basic = () => (
  <Document>
    <Select>
      <option></option>
      <option>Foo</option>
      <option>Bar</option>
      <option>Baz</option>
    </Select>
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <Select defaultValue="Foo">
      <option></option>
      <option>Foo</option>
      <option>Bar</option>
      <option>Baz</option>
    </Select>
  </Document>
);

export const Small = () => (
  <Document>
    <Select size="small" defaultValue="Foo">
      <option></option>
      <option>Foo</option>
      <option>Bar</option>
      <option>Baz</option>
    </Select>
  </Document>
);

export const Large = () => (
  <Document>
    <Select size="large" defaultValue="Foo">
      <option></option>
      <option>Foo</option>
      <option>Bar</option>
      <option>Baz</option>
    </Select>
  </Document>
);
