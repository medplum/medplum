import { Meta } from '@storybook/react';
import React from 'react';
import { Button } from '../Button';
import { Document } from '../Document';

export default {
  title: 'Medplum/Button',
  component: Button,
} as Meta;

export const Primary = () => (
  <Document>
    <Button primary={true}>Button</Button>
  </Document>
);

export const Secondary = () => (
  <Document>
    <Button>Button</Button>
  </Document>
);

export const Danger = () => (
  <Document>
    <Button danger={true}>Button</Button>
  </Document>
);

export const Large = () => (
  <Document>
    <Button size="large">Button</Button>
  </Document>
);

export const Small = () => (
  <Document>
    <Button size="small">Button</Button>
  </Document>
);
