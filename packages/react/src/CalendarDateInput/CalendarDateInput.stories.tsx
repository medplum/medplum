// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { withMockedDate } from '../stories/decorators';
import { CalendarDateInput } from './CalendarDateInput';

export default {
  title: 'Medplum/CalendarDateInput',
  component: CalendarDateInput,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <CalendarDateInput
        availableDates={[new Date()]}
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={(date: Date) => console.log('Clicked ' + date)}
      />
    </Document>
  );
};
