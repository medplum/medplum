import { Paper, ScrollArea, Tabs } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';
import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { InfoBar } from '../components/InfoBar';
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
   * @param newTabName - The new tab name.
   */
  function onTabChange(newTabName: string | null): void {
    navigate(`/admin/${newTabName}`);
  }

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
          <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
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
      <Document>
        <Outlet />
      </Document>
    </>
  );
}
