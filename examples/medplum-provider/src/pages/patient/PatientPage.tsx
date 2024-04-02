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
  {
    id: 'tasks',
    url: 'Task?_fields=_lastUpdated,code,status,focus&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Tasks',
  },
  {
    id: 'meds',
    url: 'MedicationRequest?_fields=medication[x],intent,status&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Meds',
  },
  {
    id: 'labs',
    url: 'ServiceRequest?_fields=_lastUpdated,code,status,orderDetail,category&_offset=0&_sort=-_lastUpdated&category=108252007&patient=%patient.id',
    label: 'Labs',
  },
  {
    id: 'devices',
    url: 'Device?_fields=manufacturer,deviceName,status,distinctIdentifier,serialNumber&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Devices',
  },
  {
    id: 'diagnosticreports',
    url: 'DiagnosticReport?_fields=_lastUpdated,category,code,status&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Reports',
  },
  {
    id: 'documentreference',
    url: 'DocumentReference?_fields=_lastUpdated,category,type,status,author&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Documents',
  },
  {
    id: 'appointments',
    url: 'Appointment?_fields=_lastUpdated,category,type,status,author&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Appointments',
  },
  {
    id: 'careplan',
    url: 'CarePlan?_fields=_lastUpdated,status,intent,category,period&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Care Plans',
  },
];

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const patient = usePatient();
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tabId = window.location.pathname.split('/')[3] ?? '';
    const tab = tabId ? tabs.find((t) => t.id === tabId || t.url.startsWith(tabId)) : undefined;
    return (tab ?? tabs[0]).id;
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
