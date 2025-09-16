// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs, Title } from '@mantine/core';
import { forbidden } from '@medplum/core';
import { Container, OperationOutcomeAlert, Panel, useMedplum } from '@medplum/react';
import { JSX, useState } from 'react';
import { GINIndexes } from './db/GINIndexes';

export function DatabaseToolsPage(): JSX.Element {
  const medplum = useMedplum();
  const tabs = ['GIN Indexes'];
  const [currentTab, setCurrentTab] = useState(tabs[0]);

  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = tabs[0];
    }
    setCurrentTab(newTabName);
  }

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  return (
    <Container maw="100%">
      <Panel>
        <Title order={1}>Database Tools</Title>
        <Tabs value={currentTab} onChange={onTabChange}>
          <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            {tabs.map((t) => (
              <Tabs.Tab key={t} value={t}>
                {t}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="GIN Indexes" pt="md">
            <GINIndexes />
          </Tabs.Panel>
        </Tabs>
      </Panel>
    </Container>
  );
}
