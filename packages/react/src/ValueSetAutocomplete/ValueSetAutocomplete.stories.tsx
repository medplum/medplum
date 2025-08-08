// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ValueSetAutocomplete } from './ValueSetAutocomplete';

export default {
  title: 'Medplum/ValueSetAutocomplete',
  component: ValueSetAutocomplete,
} as Meta;

export const Single = (): JSX.Element => (
  <Document>
    <ValueSetAutocomplete binding="x" onChange={console.log} maxValues={1} />
  </Document>
);

export const Multiple = (): JSX.Element => (
  <Document>
    <ValueSetAutocomplete binding="x" onChange={console.log} maxValues={3} />
  </Document>
);

export const MinimumInput = (): JSX.Element => (
  <Document>
    <ValueSetAutocomplete binding="x" onChange={console.log} maxValues={3} minInputLength={3} />
  </Document>
);
