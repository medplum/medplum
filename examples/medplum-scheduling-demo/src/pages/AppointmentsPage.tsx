import { Paper, Tabs } from '@mantine/core';
import { Filter, Operator, SearchRequest } from '@medplum/core';
import { MemoizedSearchControl } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function useTab(): [string, (tab: string) => void, SearchRequest, (definition: SearchRequest) => void] {
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

  const { tab } = useParams();
  const [search, updateSearch] = useState<SearchRequest>({
    resourceType: 'Appointment',
    fields: ['patient', 'start', 'end', 'serviceType', '_lastUpdated'],
    filters: [tab === 'upcoming' ? upcomingFilter : pastFilter],
  } as SearchRequest);

  function setSearch(definition: SearchRequest): void {
    updateSearch(definition);
  }

  function changeTab(newTab: string): void {
    // Remove date filters keeping others
    const filters = search.filters?.filter((f) => f.code !== 'date');

    // Add the appropriate date filter depending on the active tab
    if (newTab === 'upcoming') {
      filters?.push(upcomingFilter);
    } else if (newTab === 'past') {
      filters?.push(pastFilter);
    }

    updateSearch({
      ...search,
      filters,
    } as SearchRequest);
  }

  return [tab ?? '', changeTab, search, setSearch];
}

export function AppointmentsPage(): JSX.Element {
  const navigate = useNavigate();
  const [tab, changeTab, search, setSearch] = useTab();

  const tabs = [
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
  ];

  useEffect(() => {
    if (!['upcoming', 'past'].includes(tab ?? '')) {
      navigate('/Appointment/upcoming');
    }
  }, [tab, navigate]);

  function handleTabChange(newTab: string | null): void {
    if (newTab === 'upcoming') {
      navigate('/Appointment/upcoming');
      changeTab('upcoming');
    } else {
      navigate('/Appointment/past');
      changeTab('past');
    }
  }

  return (
    <Paper shadow="xs" m="md" p="xs">
      <Tabs value={tab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List mb="xs">
          {tabs.map((tab) => (
            <Tabs.Tab value={tab[0]} key={tab[0]}>
              {tab[1]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <MemoizedSearchControl
        search={search}
        onClick={() => {}}
        onAuxClick={() => {}}
        onChange={(e) => {
          setSearch(e.definition);
        }}
        checkboxesEnabled={false}
        hideFilters
        hideToolbar
      />
    </Paper>
  );
}
