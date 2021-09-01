import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { SmartText } from '../SmartText';

export default {
  title: 'Medplum/SmartText',
  component: SmartText,
} as Meta;

export const Basic = () => (
  <Document>
    <SmartText />
  </Document>
);

export const DefaultValue = () => (
  <Document>
    <SmartText value="Hello world" />
  </Document>
);
