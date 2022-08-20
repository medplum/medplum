import { Document, Scrollable, Tab, TabList, useMedplum } from '@medplum/react';
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
   * @param button Which mouse button was used to change the tab.
   */
  function onTabChange(newTabName: string, button: number): void {
    const url = `/admin/${newTabName}`;
    if (button === 1) {
      // "Aux Click" / middle click
      // Open in new tab or new window
      window.open(url, '_blank');
    } else {
      // Otherwise, by default, navigate to the new tab
      navigate(url);
    }
  }

  return (
    <>
      <Scrollable className="medplum-surface" height={50}>
        <div className="medplum-resource-header">
          <dl>
            <dt>Project</dt>
            <dd>{result.project.name}</dd>
          </dl>
        </div>
      </Scrollable>
      <TabList value={currentTab.toLowerCase()} onChange={onTabChange}>
        {tabs.map((t) => (
          <Tab key={t} name={t.toLowerCase()} label={t} />
        ))}
      </TabList>
      <Document width={700}>
        <Outlet />
      </Document>
    </>
  );
}
