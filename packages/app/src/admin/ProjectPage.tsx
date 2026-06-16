// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, ScrollArea } from '@mantine/core';
import type { TabDefinition } from '@medplum/react';
import { Container, InfoBar, LinkTabs, Panel, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { Outlet } from 'react-router';
import { getProjectId } from '../utils';

const tabs: TabDefinition[] = [
  { label: 'Details', value: 'details' },
  { label: 'Users', value: 'users' },
  { label: 'Clients', value: 'clients' },
  { label: 'Bots', value: 'bots' },
  { label: 'Secrets', value: 'secrets' },
  { label: 'Settings', value: 'settings' },
  { label: 'Sites', value: 'sites' },
  { label: 'Rate Limits', value: 'rate-limits' },
];

export function ProjectPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = useMemo(() => medplum.get('admin/projects/' + projectId).read(), [medplum, projectId]);

  return (
    <>
      <Paper>
        <InfoBar>
          <InfoBar.Entry>
            <InfoBar.Key>Project</InfoBar.Key>
            <InfoBar.Value>{result.project.name}</InfoBar.Value>
          </InfoBar.Entry>
        </InfoBar>
        <ScrollArea>
          <LinkTabs baseUrl="/admin" tabs={tabs} />
        </ScrollArea>
      </Paper>
      <Container maw="100%">
        <Panel>
          <Outlet />
        </Panel>
      </Container>
    </>
  );
}
