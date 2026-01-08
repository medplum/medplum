// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ResourceBadge } from './ResourceBadge';

export default {
  title: 'Medplum/ResourceBadge',
  component: ResourceBadge,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ResourceBadge value={HomerSimpson} />
  </Document>
);
