import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { Logo } from '../Logo';

export default {
  title: 'Medplum/Logo',
  component: Logo,
} as Meta;

export const Basic = () => (
  <Document>
    <Logo size={200} />
  </Document>
);
