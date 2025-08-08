// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { PatientExportForm } from './PatientExportForm';

export default {
  title: 'Medplum/PatientExportForm',
  component: PatientExportForm,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <Title order={1}>Patient Export</Title>
    <PatientExportForm patient={HomerSimpson} />
  </Document>
);
