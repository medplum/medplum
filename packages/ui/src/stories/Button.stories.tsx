import { Meta } from '@storybook/react';
import React from 'react';
import { Button } from '../Button';
import { Document } from '../Document';

export default {
  title: 'Medplum/Button',
  component: Button,
} as Meta;

export const Primary = (): JSX.Element => (
  <Document>
    <Button primary={true}>Button</Button>
  </Document>
);

export const Secondary = (): JSX.Element => (
  <Document>
    <Button>Button</Button>
  </Document>
);

export const Danger = (): JSX.Element => (
  <Document>
    <Button danger={true}>Button</Button>
  </Document>
);

export const Large = (): JSX.Element => (
  <Document>
    <Button size="large">Button</Button>
  </Document>
);

export const Small = (): JSX.Element => (
  <Document>
    <Button size="small">Button</Button>
  </Document>
);
