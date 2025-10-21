// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ResourceName } from './ResourceName';

export default {
  title: 'Medplum/ResourceName',
  component: ResourceName,
} as Meta;

export const Resource = (): JSX.Element => (
  <Document>
    <ResourceName value={HomerSimpson} />
  </Document>
);

export const Reference = (): JSX.Element => (
  <Document>
    <ResourceName value={{ reference: 'Patient/123' }} />
  </Document>
);

export const Invalid = (): JSX.Element => (
  <Document>
    <ResourceName value={{ reference: 'Patient/xyz' }} />
  </Document>
);
