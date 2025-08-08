// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { ReferenceDisplay } from './ReferenceDisplay';

export default {
  title: 'Medplum/ReferenceDisplay',
  component: ReferenceDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ReferenceDisplay value={{ reference: 'Patient/123', display: 'Homer Simpson' }} />
  </Document>
);
