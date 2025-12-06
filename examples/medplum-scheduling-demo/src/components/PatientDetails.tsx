// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs } from '@mantine/core';
import type { Filter, SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { Document, LinkTabs, ResourceTable, SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

interface PatientDetailsProps {
  patient: Patient;
}

export function PatientDetails(props: PatientDetailsProps): JSX.Element {
  const { patient } = props;
  const navigate = useNavigate();

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

  const tabs = ['Details', 'Upcoming', 'Encounters'];

  return (
    <Document>
      <LinkTabs baseUrl={`/Patient/${patient.id}`} tabs={tabs}>
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
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
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
      </LinkTabs>
    </Document>
  );
}
