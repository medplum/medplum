// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { PatientTimeline } from './PatientTimeline';

export default {
  title: 'Medplum/PatientTimeline',
  component: PatientTimeline,
} as Meta;

export const Patient = (): JSX.Element => <PatientTimeline patient={HomerSimpson} />;
