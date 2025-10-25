// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { AddressDisplay } from './AddressDisplay';

export default {
  title: 'Medplum/AddressDisplay',
  component: AddressDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AddressDisplay value={HomerSimpson.address?.[0]} />
  </Document>
);
