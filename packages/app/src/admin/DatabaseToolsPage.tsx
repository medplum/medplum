// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs, Title } from '@mantine/core';
import { forbidden } from '@medplum/core';
import { Container, LinkTabs, OperationOutcomeAlert, Panel, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { ArrayColumnPadding } from './db/ArrayColumnPadding';
import { ColumnStatistics } from './db/ColumnStatistics';
import { GINIndexes } from './db/GINIndexes';

const tabs = [
  { label: 'GIN Indexes', value: 'gin-indexes' },
  { label: 'Column Statistics', value: 'column-statistics' },
  { label: 'Array Column Padding', value: 'array-padding' },
];

export function DatabaseToolsPage(): JSX.Element {
  const medplum = useMedplum();

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  return (
    <Container maw="100%">
      <Panel>
        <Title order={1}>Database Tools</Title>
        <LinkTabs baseUrl="/admin/super/db" tabs={tabs}>
          <Tabs.Panel value="gin-indexes" pt="md">
            <GINIndexes />
          </Tabs.Panel>
          <Tabs.Panel value="column-statistics" pt="md">
            <ColumnStatistics />
          </Tabs.Panel>
          <Tabs.Panel value="array-padding" pt="md">
            <ArrayColumnPadding />
          </Tabs.Panel>
        </LinkTabs>
      </Panel>
    </Container>
  );
}
