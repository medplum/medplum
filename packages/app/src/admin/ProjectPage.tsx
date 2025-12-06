// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, ScrollArea } from '@mantine/core';
import { Document, InfoBar, LinkTabs, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { Outlet } from 'react-router';
import { getProjectId } from '../utils';

const tabs = ['Details', 'Users', 'Patients', 'Clients', 'Bots', 'Secrets', 'Sites'];

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
      <Document>
        <Outlet />
      </Document>
    </>
  );
}
