import { Tabs } from '@mantine/core';
import { Filter, Operator } from '@medplum/core';
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
    ['encounters', 'Encounters'],
    ['upcoming', 'Upcoming Appointments'],
    ['past', 'Past Appointments'],
  ];

  function handleTabChange(newTab: string | null): void {
    navigate(`/Appointment/${appointment.id}/${newTab}`);
  }

  // Filter definitions to be used in the SearchControl components

  const patientFilter: Filter = {
    code: 'patient',
    operator: Operator.EQUALS,
    value: `Patient/${patient.id}`,
  };
  const appointmentFilter: Filter = {
    code: 'appointment',
    operator: Operator.EQUALS,
    value: `Appointment/${appointment.id}`,
  };
  const upcomingAppointmentsFilter: Filter = {
    code: 'date',
    operator: Operator.STARTS_AFTER,
    value: new Date().toISOString(),
  };
  const pastAppointmentsFilter: Filter = {
    code: 'date',
    operator: Operator.ENDS_BEFORE,
    value: new Date().toISOString(),
  };

  // Get the current tab, default to 'details' if not found
  const tab = location.pathname.split('/')[3] ?? 'details';

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
        <Tabs.Panel value="encounters">
          <SearchControl
            search={{
              resourceType: 'Encounter',
              fields: ['period', 'class'],
              filters: [appointmentFilter],
            }}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
        <Tabs.Panel value="upcoming">
          <SearchControl
            search={{
              resourceType: 'Appointment',
              fields: ['start', 'end', 'serviceType', 'status'],
              filters: [patientFilter, upcomingAppointmentsFilter],
            }}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
        <Tabs.Panel value="past">
          <SearchControl
            search={{
              resourceType: 'Appointment',
              fields: ['start', 'end', 'serviceType', 'status'],
              filters: [patientFilter, pastAppointmentsFilter],
            }}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
