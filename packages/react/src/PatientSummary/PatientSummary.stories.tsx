// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Menu } from '@mantine/core';
import { HomerSimpson, PatientSummaryStates } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { PatientSummary, PatientSummarySkeleton } from './PatientSummary';

export default {
  title: 'Medplum/PatientSummary',
  component: PatientSummary,
  // Mock State stories freeze the clock; two on one Docs page would collide, so each gets an iframe.
  parameters: { docs: { story: { inline: false } } },
} as Meta;

export const Patient = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} />
  </Box>
);

export const Loading = (): JSX.Element => (
  <Box w={350}>
    <PatientSummarySkeleton />
  </Box>
);

const headerMenuItems = (
  <>
    <Menu.Item>Edit Patient Profile</Menu.Item>
    <Menu.Item>Import Patient Records</Menu.Item>
  </>
);

export const WithHeaderMenu = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} headerMenuItems={headerMenuItems} />
  </Box>
);

// Typed Mock States (packages/mock/src/mocks/states/patient-summary.ts): each story
// gets its own client holding only that state (see withMockState in ../stories/decorators.tsx).
const summary = (reference: string): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={{ reference }} />
  </Box>
);

export const BusyPatient = (): JSX.Element => summary(PatientSummaryStates.busyPatient.handles.patient);
BusyPatient.parameters = { mockState: PatientSummaryStates.busyPatient };

export const NewPatient = (): JSX.Element => summary(PatientSummaryStates.newPatient.handles.patient);
NewPatient.parameters = { mockState: PatientSummaryStates.newPatient };

export const TwoPatients = (): JSX.Element => (
  <Group align="flex-start">
    {summary(PatientSummaryStates.twoPatients.handles.sick)}
    {summary(PatientSummaryStates.twoPatients.handles.well)}
  </Group>
);
TwoPatients.parameters = { mockState: PatientSummaryStates.twoPatients };

export const WithHeaderMenuTruncatedName = (): JSX.Element => (
  <Box w={260}>
    <PatientSummary
      patient={{
        ...HomerSimpson,
        name: [{ given: ['Bartholomew', 'Jonathan'], family: 'Simpson-Vandermeerschen' }],
      }}
      headerMenuItems={headerMenuItems}
    />
  </Box>
);

export const SixGeneratedPatients = (): JSX.Element => (
  <Group align="flex-start">
    {Object.values(PatientSummaryStates.sixPatients.handles).map((reference) => (
      <Box key={reference} w={350}>
        <PatientSummary patient={{ reference }} />
      </Box>
    ))}
  </Group>
);
SixGeneratedPatients.parameters = { mockState: PatientSummaryStates.sixPatients };
