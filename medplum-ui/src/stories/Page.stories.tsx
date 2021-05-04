import { Meta } from '@storybook/react';
import React from 'react';
import { Page, PageProps } from '../Page';

export default {
  title: 'Medplum/Page',
  component: Page,
} as Meta;

export const Basic = (args: PageProps) => (
  <Page {...args} />
);
