import { Tabs } from '@mantine/core';
import { formatSearchQuery, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Document, SearchControl } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateTaskModal } from '../components/CreateTaskModal';

export function AllTasks(): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Task',
    fields: ['id', 'priority', 'description', 'owner', 'for'],
    sortRules: [{ code: '-priority-order,due-date' }],
  });
  const tabs = ['Active', 'Completed'];
  const [currentTab, setCurrentTab] = useState(() => {
    const searchQuery = window.location.search;
    return handleInitialTab(searchQuery);
  });
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);

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
    const filters = [];
    if (currentTab === 'active') {
      filters.push({ code: 'status:not', operator: Operator.EQUALS, value: 'completed' });
    } else {
      filters.push({ code: 'status', operator: Operator.EQUALS, value: 'completed' });
    }

    const populatedSearch = {
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
            hideFilters={true}
            onNew={() => setIsNewOpen(!isNewOpen)}
          />
        </Tabs.Panel>
        <Tabs.Panel value="completed">
          <SearchControl
            search={search}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideFilters={true}
            onNew={() => setIsNewOpen(!isNewOpen)}
          />
        </Tabs.Panel>
      </Tabs>
      <CreateTaskModal opened={isNewOpen} onClose={() => setIsNewOpen(!isNewOpen)} />
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
