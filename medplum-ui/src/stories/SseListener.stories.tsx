import { Meta } from '@storybook/react';
import React from 'react';
import { SseListener, SseListenerProps } from '../SseListener';

export default {
  title: 'Medplum/SseListener',
  component: SseListener,
} as Meta;

export const Basic = (args: SseListenerProps) => (
  <SseListener {...args} />
);
