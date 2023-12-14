import { Tabs } from '@mantine/core';
import { formatSearchQuery, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function MyTasks(): JSX.Element {
  const profile = useMedplumProfile() as Resource;
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Task',
    fields: ['id', '_lastUpdated', 'owner', 'priority', 'for'],
    sortRules: [{ code: '-priority-order,due-date' }],
  });
  const tabs = ['Active', 'Completed'];
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const searchQuery = window.location.search;
    return handleInitialTab(searchQuery);
  });

  const handleTabChange = (newTab: string) => {
    setCurrentTab(newTab);
    const updatedSearch: SearchRequest = { resourceType: 'Task' };
    updatedSearch.filters = [];

    if (newTab === 'active') {
      updatedSearch.filters.push({ code: 'status:not', operator: Operator.EQUALS, value: 'completed' });
    }
    if (newTab === 'completed') {
      updatedSearch.filters.push({ code: 'status', operator: Operator.EQUALS, value: 'completed' });
    }

    navigate(formatSearchQuery(updatedSearch));
  };

  useEffect(() => {
    // Filter for tasks assigned to the current user
    const filters = [{ code: 'owner', operator: Operator.EQUALS, value: `${getReferenceString(profile)}` }];

    // Filter for active/complete tabs
    if (currentTab === 'active') {
      filters.push({ code: 'status:not', operator: Operator.EQUALS, value: 'completed' });
    } else {
      filters.push({ code: 'status', operator: Operator.EQUALS, value: 'completed' });
    }

    const populatedSearch: SearchRequest = {
      ...search,
      filters,
    };

    setSearch(populatedSearch);
  }, [currentTab]);

  return (
    <Document>
      <Tabs value={currentTab.toLowerCase()} onTabChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="active">
          <SearchControl
            search={search}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideToolbar={true}
            hideFilters={true}
          />
        </Tabs.Panel>
        <Tabs.Panel value="completed">
          <SearchControl
            search={search}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideToolbar={true}
            hideFilters={true}
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}

function handleInitialTab(searchQuery: string) {
  if (searchQuery === '?status=completed') {
    return 'completed';
  } else {
    return 'active';
  }
}
