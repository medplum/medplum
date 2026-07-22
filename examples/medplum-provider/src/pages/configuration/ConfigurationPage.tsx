// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import { Document, LinkTabs } from '@medplum/react';
import type { JSX } from 'react';
import { Outlet } from 'react-router';

const tabs = [
  { label: 'Visit Types', value: 'visit-types' },
  { label: 'Rooms & Devices', value: 'rooms' },
  { label: 'Providers & Resources', value: 'providers' },
];

/**
 * Configuration screen (spec, screen #3 of 3) — the ops/practice-manager
 * surface for setting up visit types, rooms/devices, and which
 * providers/resources fulfill each visit type. Route-synced tabs via
 * `LinkTabs`, matching this app's other multi-sub-page tabbed screens
 * (`ResourcePage`, `PatientPage`) rather than local-state `Tabs` — each tab
 * is a full sub-page with its own list/forms, not a filter over one list.
 * @returns The Configuration screen shell element.
 */
export function ConfigurationPage(): JSX.Element {
  return (
    <Document>
      <Stack>
        <Title order={2}>Configuration</Title>
        <LinkTabs baseUrl="/Configuration" tabs={tabs} />
        <Outlet />
      </Stack>
    </Document>
  );
}
