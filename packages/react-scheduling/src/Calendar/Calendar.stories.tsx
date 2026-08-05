// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { withMockedDate } from '../stories/decorators';
import { Calendar } from './Calendar';

export default {
  title: 'Medplum/Calendar',
  component: Calendar,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => (
  <div style={{ height: 600, padding: '1em' }}>
    <Calendar slots={[]} appointments={[]} />
  </div>
);
