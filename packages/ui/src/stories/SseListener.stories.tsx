import { Meta } from '@storybook/react';
import React from 'react';
import { SseListener } from '../SseListener';

export default {
  title: 'Medplum/SseListener',
  component: SseListener,
} as Meta;

export const Basic = () => (
  <SseListener />
);
