import { Paper, Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Filter, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { SearchControl, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateAppointment } from '../components/CreateAppointment';

export function AppointmentsPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();
  const location = useLocation();
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);

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
    fields: ['patient', 'start', 'end', 'serviceType', '_lastUpdated'],
    filters: [
      { code: 'actor', operator: Operator.EQUALS, value: getReferenceString(profile as Practitioner) },
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
      navigate('/Appointment/upcoming');
    }
  }, [tab, navigate]);

  function changeTab(newTab: string | null): void {
    // Remove date filters keeping others
    const filters = search.filters?.filter((f) => f.code !== 'date');

    // Add the appropriate date filter depending on the active tab
    if (newTab === 'upcoming') {
      navigate('/Appointment/upcoming');
      filters?.push(upcomingFilter);
    } else if (newTab === 'past') {
      navigate('/Appointment/past');
      filters?.push(pastFilter);
    }

    setSearch({
      ...search,
      filters,
    } as SearchRequest);
  }

  return (
    <Paper shadow="xs" m="md" p="xs">
      <CreateAppointment opened={createAppointmentOpened} handlers={createAppointmentHandlers} />
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
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          setSearch(e.definition);
        }}
        onNew={() => createAppointmentHandlers.open()}
        checkboxesEnabled={false}
        hideFilters
      />
    </Paper>
  );
}
