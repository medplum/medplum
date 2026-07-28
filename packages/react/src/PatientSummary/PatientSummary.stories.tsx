// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Menu } from '@mantine/core';
import { HomerSimpson } from '@medplum/mock';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { PatientSummary } from './PatientSummary';

export default {
  title: 'Medplum/PatientSummary',
  component: PatientSummary,
} as Meta;

export const Patient = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} />
  </Box>
);

const headerMenuItems = (
  <>
    <Menu.Item>Edit Patient Profile</Menu.Item>
    <Menu.Item>Import Patient Records</Menu.Item>
  </>
);

// The "…" actions menu only renders when headerMenuItems is provided.
export const WithHeaderMenu = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} headerMenuItems={headerMenuItems} />
  </Box>
);

// A name long enough to truncate, so the gap the header row reserves between the
// name and the always-visible "…" trigger is visible at a narrow width.
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
