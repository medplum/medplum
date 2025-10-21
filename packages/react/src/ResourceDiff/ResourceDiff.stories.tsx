// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ResourceDiff } from './ResourceDiff';

export default {
  title: 'Medplum/ResourceDiff',
  component: ResourceDiff,
} as Meta;

export const Basic = (): JSX.Element => {
  const original = HomerSimpson;
  const revised = { ...HomerSimpson, name: [{ given: ['Homer', 'J.'], family: 'Sampson' }] };
  return (
    <Document>
      <ResourceDiff original={original} revised={revised} />
    </Document>
  );
};
