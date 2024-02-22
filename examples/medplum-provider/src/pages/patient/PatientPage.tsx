import { Loader, Paper, ScrollArea, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { PatientSummary } from '@medplum/react';
import { Fragment, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePatient } from '../../hooks/usePatient';
import classes from './PatientPage.module.css';

const tabs = [
  { id: 'timeline', url: '', label: 'Timeline' },
  { id: 'edit', url: 'edit', label: 'Edit' },
  { id: 'encounter', url: 'encounter', label: 'Encounter' },
  { id: 'tasks', url: 'Task?patient=%patient.id', label: 'Tasks' },
  { id: 'meds', url: 'MedicationRequest?patient=%patient.id', label: 'Meds' },
  { id: 'labs', url: 'ServiceRequest?patient=%patient.id', label: 'Labs' },
  { id: 'devices', url: 'Device?patient=%patient.id', label: 'Devices' },
];

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const patient = usePatient();
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tabId = window.location.pathname.split('/')[3] ?? '';
    return tabId && tabs.find((t) => t.id === tabId) ? tabId : tabs[0].id;
  });

  if (!patient) {
    return <Loader />;
  }

  /**
   * Handles a tab change event.
   * @param newTabName - The new tab name.
   */
  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = tabs[0].id;
    }

    const tab = tabs.find((t) => t.id === newTabName);
    if (tab) {
      setCurrentTab(tab.id);
      navigate(`/Patient/${patient?.id}/${tab.url.replace('%patient.id', patient?.id as string)}`);
    }
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <div className={classes.container}>
        <div className={classes.sidebar}>
          <PatientSummary w={350} mb="auto" patient={patient} />
        </div>
        <div className={classes.content}>
          <Paper>
            <ScrollArea>
              <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
                <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
                  {tabs.map((t) => (
                    <Tabs.Tab key={t.id} value={t.id}>
                      {t.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            </ScrollArea>
          </Paper>
          <Outlet />
        </div>
      </div>
    </Fragment>
  );
}
