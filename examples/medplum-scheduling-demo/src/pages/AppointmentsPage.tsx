// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Tabs } from '@mantine/core';
import { Filter, getReferenceString, Operator, SearchRequest, WithId } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { SearchControl, useMedplumProfile } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

export function AppointmentsPage(): JSX.Element {
  const profile = useMedplumProfile() as WithId<Practitioner>;
  const navigate = useNavigate();
  const location = useLocation();

  const tab = location.pathname.split('/').pop() ?? '';

  const tabs = [
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
  ];

  const upcomingFilter: Filter = {
    code: 'date',
    operator: Operator.STARTS_AFTER,
    value: new Date().toISOString(),
  };
  const pastFilter: Filter = {
    code: 'date',
    operator: Operator.ENDS_BEFORE,
    value: new Date().toISOString(),
  };

  // Start the SearchRequest with the appropriate filter depending on the active tab
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Appointment',
    fields: ['patient', 'start', 'end', 'status', 'appointmentType', 'serviceType'],
    filters: [
      { code: 'actor', operator: Operator.EQUALS, value: getReferenceString(profile) },
      tab === 'upcoming' ? upcomingFilter : pastFilter,
    ],
    sortRules: [
      {
        code: 'date',
      },
    ],
  });

  // Ensure tab is either 'upcoming' or 'past'
  // if it's neither, navigate to the 'upcoming' tab
  useEffect(() => {
    if (!['upcoming', 'past'].includes(tab)) {
      navigate('/Appointment/upcoming')?.catch(console.error);
    }
  }, [tab, navigate]);

  function changeTab(newTab: string | null): void {
    // Remove date filters keeping others
    const filters = search.filters?.filter((f) => f.code !== 'date');

    // Add the appropriate date filter depending on the active tab
    if (newTab === 'upcoming') {
      navigate('/Appointment/upcoming')?.catch(console.error);
      filters?.push(upcomingFilter);
    } else if (newTab === 'past') {
      navigate('/Appointment/past')?.catch(console.error);
      filters?.push(pastFilter);
    }

    setSearch({
      ...search,
      filters,
    } as SearchRequest);
  }

  return (
    <Paper shadow="xs" m="md" p="xs">
      <Tabs value={tab.toLowerCase()} onChange={changeTab}>
        <Tabs.List mb="xs">
          {tabs.map((tab) => (
            <Tabs.Tab value={tab[0]} key={tab[0]}>
              {tab[1]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          setSearch(e.definition);
        }}
        onNew={() => navigate('/Schedule')?.catch(console.error)} // Redirect to the Schedule page where the user can create a new appointment
        checkboxesEnabled={false}
        hideFilters
      />
    </Paper>
  );
}
