// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerServiceRequest } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ServiceRequestTimeline } from './ServiceRequestTimeline';

export default {
  title: 'Medplum/ServiceRequestTimeline',
  component: ServiceRequestTimeline,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <ServiceRequestTimeline serviceRequest={HomerServiceRequest} />
  </Document>
);
