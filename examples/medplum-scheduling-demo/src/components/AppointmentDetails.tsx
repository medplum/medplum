import { Tabs } from '@mantine/core';
import { Operator, SearchRequest } from '@medplum/core';
import { Appointment, Patient } from '@medplum/fhirtypes';
import { Document, ResourceHistoryTable, ResourceTable, SearchControl } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface AppointmentDetailsProps {
  appointment: Appointment;
  patient: Patient;
}

export function AppointmentDetails(props: AppointmentDetailsProps): JSX.Element {
  const navigate = useNavigate();
  const { patient, appointment } = props;

  const tabs = [
    ['details', 'Details'],
    ['history', 'Patient History'],
    ['upcoming', 'Upcoming'],
  ];

  // Get the current tab
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t[0]).includes(tab) ? tab : tabs[0][0];

  function handleTabChange(newTab: string | null): void {
    navigate(`/Appointment/${appointment.id}/${newTab ?? ''}`);
  }

  const upcomingAppointmentSearch: SearchRequest = {
    resourceType: 'Appointment',
    filters: [
      { code: 'patient', operator: Operator.EQUALS, value: `Patient/${props.patient.id}` },
      { code: 'date', operator: Operator.STARTS_AFTER, value: new Date().toISOString() },
    ],
    fields: ['start', 'end', 'serviceType', 'status'],
  };

  return (
    <Document>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List mb="xs">
          {tabs.map((tab) => (
            <Tabs.Tab value={tab[0]} key={tab[0]}>
              {tab[1]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable value={props.appointment} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Patient" id={patient.id} />
        </Tabs.Panel>
        <Tabs.Panel value="upcoming">
          <SearchControl
            search={upcomingAppointmentSearch}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
