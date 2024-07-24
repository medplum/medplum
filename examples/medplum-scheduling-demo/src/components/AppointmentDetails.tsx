import { Tabs } from '@mantine/core';
import { Filter, Operator, SearchRequest } from '@medplum/core';
import { Appointment, Patient } from '@medplum/fhirtypes';
import { Document, ResourceTable, SearchControl } from '@medplum/react';
import { useLocation, useNavigate } from 'react-router-dom';

interface AppointmentDetailsProps {
  appointment: Appointment;
  patient: Patient;
}

export function AppointmentDetails(props: AppointmentDetailsProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { patient, appointment } = props;

  const tabs = [
    ['details', 'Details'],
    ['upcoming', 'Upcoming Appointments'],
    ['past', 'Past Appointments'],
  ];

  function handleTabChange(newTab: string | null): void {
    navigate(`/Appointment/${appointment.id}/${newTab}`);
  }

  const appointmentSearch: SearchRequest = {
    resourceType: 'Appointment',
    fields: ['start', 'end', 'serviceType', 'status'],
  };
  const patientFilter: Filter = { code: 'patient', operator: Operator.EQUALS, value: `Patient/${patient.id}` };
  const upcomingAppointmentFilter: Filter = {
    code: 'date',
    operator: Operator.STARTS_AFTER,
    value: new Date().toISOString(),
  };
  const pastAppointmentFilter: Filter = {
    code: 'date',
    operator: Operator.ENDS_BEFORE,
    value: new Date().toISOString(),
  };

  // Get the current tab
  const tab = location.pathname.split('/').pop() ?? '';

  return (
    <Document>
      <Tabs value={tab.toLowerCase()} onChange={handleTabChange}>
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
        <Tabs.Panel value="upcoming">
          <SearchControl
            search={{
              ...appointmentSearch,
              filters: [patientFilter, upcomingAppointmentFilter],
            }}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
        <Tabs.Panel value="past">
          <SearchControl
            search={{
              ...appointmentSearch,
              filters: [patientFilter, pastAppointmentFilter],
            }}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
