import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { Select } from '../Select';

export default {
  title: 'Medplum/Select',
  component: Select,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Select>
      <option></option>
      <option>Foo</option>
      <option>Bar</option>
      <option>Baz</option>
    </Select>
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <Select defaultValue="Foo">
      <option></option>
      <option>Foo</option>
      <option>Bar</option>
      <option>Baz</option>
    </Select>
  </Document>
);
