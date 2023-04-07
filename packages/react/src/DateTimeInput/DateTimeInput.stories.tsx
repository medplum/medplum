import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { DateTimeInput } from './DateTimeInput';

export default {
  title: 'Medplum/DateTimeInput',
  component: DateTimeInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <DateTimeInput onChange={console.log} />
  </Document>
);
