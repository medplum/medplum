// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ResourceBlame } from './ResourceBlame';

export default {
  title: 'Medplum/ResourceBlame',
  component: ResourceBlame,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ResourceBlame resourceType="Patient" id={HomerSimpson.id} />
  </Document>
);
