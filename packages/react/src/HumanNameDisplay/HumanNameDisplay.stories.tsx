// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HumanName } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { HumanNameDisplay } from './HumanNameDisplay';

export default {
  title: 'Medplum/HumanNameDisplay',
  component: HumanNameDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <HumanNameDisplay value={{ prefix: ['Mr.'], given: ['Homer', 'J.'], family: 'Simpson' } as HumanName} />
  </Document>
);
