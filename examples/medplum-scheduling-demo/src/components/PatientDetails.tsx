import { Tabs } from '@mantine/core';
import { Filter, Operator, SearchRequest } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { Document, ResourceTable, SearchControl } from '@medplum/react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface PatientDetailsProps {
  patient: Patient;
}

export function PatientDetails(props: PatientDetailsProps): JSX.Element {
  const { patient } = props;
  const navigate = useNavigate();
  const location = useLocation();

  // Filters to be used in SearchControl search

  const patientFilter: Filter = {
    code: 'patient',
    operator: Operator.EQUALS,
    value: `Patient/${patient.id}`,
  };
  const upcomingAppointmentsFilter: Filter = {
    code: 'date',
    operator: Operator.STARTS_AFTER,
    value: new Date().toISOString(),
  };

  // Search state to control the SearchControl components

  const [appointmentsSearch, setAppointmentsSearch] = useState<SearchRequest>({
    resourceType: 'Appointment',
    fields: ['start', 'end', 'serviceType', 'status'],
    filters: [patientFilter, upcomingAppointmentsFilter],
    sortRules: [
      {
        code: 'date',
      },
    ],
  });

  const [encountersSearch, setEncountersSearch] = useState<SearchRequest>({
    resourceType: 'Encounter',
    fields: ['period', 'serviceType'],
    filters: [patientFilter],
    sortRules: [
      {
        code: '-date',
      },
    ],
  });

  const tabs = [
    ['details', 'Details'],
    ['upcoming', 'Upcoming Appointments'],
    ['encounters', 'Encounters'],
  ];

  // Get the current tab, default to 'details' if not found
  const tab = location.pathname.split('/')[3] ?? 'details';

  function handleTabChange(newTab: string | null): void {
    navigate(`/Patient/${patient.id}/${newTab}`);
  }

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
          <ResourceTable value={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="upcoming">
          <SearchControl
            search={appointmentsSearch}
            onChange={(e) => setAppointmentsSearch(e.definition)}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
        <Tabs.Panel value="encounters">
          <SearchControl
            search={encountersSearch}
            onChange={(e) => setEncountersSearch(e.definition)}
            hideFilters
            hideToolbar
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
