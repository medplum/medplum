import { Meta } from '@storybook/react';
import React from 'react';
import { Header, HeaderProps } from '../Header';

export default {
  title: 'Medplum/Header',
  component: Header,
} as Meta;

export const Basic = (args: HeaderProps) => (
  <Header {...args} />
);
