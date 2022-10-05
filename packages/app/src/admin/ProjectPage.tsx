import { Paper, ScrollArea, Tabs } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';
import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getProjectId } from '../utils';

const tabs = ['Details', 'Users', 'Patients', 'Clients', 'Bots', 'Secrets', 'Sites'];

export function ProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = location.pathname.replace('/admin/', '') || tabs[0];
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = useMemo(() => medplum.get('admin/projects/' + projectId).read(), [medplum, projectId]);

  /**
   * Handles a tab change event.
   * @param newTabName The new tab name.
   */
  function onTabChange(newTabName: string): void {
    navigate(`/admin/${newTabName}`);
  }

  return (
    <>
      <Paper>
        <ScrollArea>
          <div className="medplum-resource-header">
            <dl>
              <dt>Project</dt>
              <dd>{result.project.name}</dd>
            </dl>
          </div>
        </ScrollArea>
        <ScrollArea>
          <Tabs value={currentTab.toLowerCase()} onTabChange={onTabChange}>
            <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
              {tabs.map((t) => (
                <Tabs.Tab key={t} value={t.toLowerCase()}>
                  {t}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        </ScrollArea>
      </Paper>
      <Document width={700}>
        <Outlet />
      </Document>
    </>
  );
}
