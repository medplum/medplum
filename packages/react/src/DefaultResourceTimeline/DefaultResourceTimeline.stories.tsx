// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { withMockedDate } from '../stories/decorators';
import { DefaultResourceTimeline } from './DefaultResourceTimeline';

export default {
  title: 'Medplum/DefaultResourceTimeline',
  component: DefaultResourceTimeline,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element | null => {
  return (
    <Document>
      <DefaultResourceTimeline resource={HomerSimpson} />
    </Document>
  );
};
