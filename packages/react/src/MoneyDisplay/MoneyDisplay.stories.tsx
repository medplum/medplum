// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Money } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { MoneyDisplay } from './MoneyDisplay';

export default {
  title: 'Medplum/MoneyDisplay',
  component: MoneyDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  //Use the ISO 4217 Currency Code to specify the currency type
  <Document>
    <MoneyDisplay value={{ value: 101.55, currency: 'USD' } as Money} />
  </Document>
);
