// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { PatientSummary } from './PatientSummary';
import {
  AllergiesSection,
  MedicationsSection,
  ProblemListSection,
  VitalsSection,
} from './sectionConfigs';
import { summaryResourceListSection } from './SummaryResourceListSection';

export default {
  title: 'Medplum/PatientSummary',
  component: PatientSummary,
} as Meta;

export const Patient = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} />
  </Box>
);

export const SubsetOfSections = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary
      patient={HomerSimpson}
      sections={[AllergiesSection, MedicationsSection, VitalsSection]}
    />
  </Box>
);

export const CustomResourceListSection = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary
      patient={HomerSimpson}
      sections={[
        AllergiesSection,
        summaryResourceListSection({
          key: 'conditions',
          title: 'Active Conditions',
          search: { resourceType: 'Condition', patientParam: 'patient' },
          getStatus: (resource) => {
            const status = (resource as { clinicalStatus?: { coding?: { code?: string }[] } }).clinicalStatus?.coding?.[0]?.code;
            return status ? { label: status, color: status === 'active' ? 'green' : 'gray' } : undefined;
          },
        }),
        VitalsSection,
      ]}
    />
  </Box>
);

export const CustomRenderSection = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary
      patient={HomerSimpson}
      sections={[
        ProblemListSection,
        {
          key: 'custom-notes',
          title: 'Clinical Notes',
          render: ({ patient }) => (
            <div style={{ padding: '8px 0' }}>
              <strong>Clinical Notes</strong>
              <p>No clinical notes for {patient.name?.[0]?.given?.[0]}.</p>
            </div>
          ),
        },
        MedicationsSection,
      ]}
    />
  </Box>
);
