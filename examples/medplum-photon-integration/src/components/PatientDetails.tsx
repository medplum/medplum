import { Tabs } from '@mantine/core';
import { Document } from '@medplum/react';
import { useNavigate } from 'react-router-dom';
import { PatientHistory } from './PatientHistory';
import { PatientOverview } from './PatientOverview';
import { PatientPrescription } from './PatientPrescription';
import { Timeline } from './Timeline';

export function PatientDetails(): JSX.Element {
  const navigate = useNavigate();
  const tabs = ['Overview', 'Timeline', 'History', 'Prescriptions'];
  function handleTabChange(newTab: string | null): void {
    navigate(`./${newTab ?? ''}`);
  }

  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  return (
    <Document>
      <Tabs value={currentTab} onChange={handleTabChange}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab value={tab.toLowerCase()}>{tab}</Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="overview">
          <PatientOverview />
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <Timeline />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <PatientHistory />
        </Tabs.Panel>
        <Tabs.Panel value="prescriptions">
          <PatientPrescription />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
