import { Meta } from '@storybook/react';
import React from 'react';
import { Button, ButtonProps } from '../Button';
import { Document } from '../Document';

export default {
  title: 'Medplum/Button',
  component: Button,
} as Meta;

export const Primary = (args: ButtonProps) => (
  <Document>
    <Button primary={true}>Button</Button>
  </Document>
);

export const Secondary = (args: ButtonProps) => (
  <Document>
    <Button>Button</Button>
  </Document>
);

export const Danger = (args: ButtonProps) => (
  <Document>
    <Button danger={true}>Button</Button>
  </Document>
);

export const Large = (args: ButtonProps) => (
  <Document>
    <Button size="large">Button</Button>
  </Document>
);

export const Small = (args: ButtonProps) => (
  <Document>
    <Button size="small">Button</Button>
  </Document>
);
