import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { SmartText, SmartTextProps } from '../SmartText';

export default {
  title: 'Medplum/SmartText',
  component: SmartText,
} as Meta;

export const Basic = (args: SmartTextProps) => (
  <Document>
    <SmartText />
  </Document>
);

export const DefaultValue = (args: SmartTextProps) => (
  <Document>
    <SmartText value="Hello world" />
  </Document>
);
