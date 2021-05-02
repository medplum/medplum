import { Meta } from '@storybook/react';
import React from 'react';
import { Button, ButtonProps } from '../Button';

export default {
  title: 'Medplum/Button',
  component: Button,
} as Meta;

export const Primary = (args: ButtonProps) => (
  <Button primary={true}>Button</Button>
);

export const Secondary = (args: ButtonProps) => (
  <Button>Button</Button>
);

export const Danger = (args: ButtonProps) => (
  <Button danger={true}>Button</Button>
);

export const Large = (args: ButtonProps) => (
  <Button size="large">Button</Button>
);

export const Small = (args: ButtonProps) => (
  <Button size="small">Button</Button>
);
