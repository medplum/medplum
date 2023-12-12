import { Tabs } from '@mantine/core';
import {
  formatSearchQuery,
  getReferenceString,
  Operator,
  parseSearchDefinition,
  SearchRequest,
  SortRule,
} from '@medplum/core';
import { Document, Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { CreateTaskModal } from '../components/CreateTaskModal';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);
  const tabs = ['Active', 'Completed'];
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  const handleTabChange = (newTab: string) => {
    console.log(newTab);
    setCurrentTab(newTab);
  };

  useEffect(() => {
    // Parse the search definition from the url and get the correct fields for the resource type
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);
    const fields = getDefaultFields(parsedSearch.resourceType);
    const sort = getDefaultSort(parsedSearch.resourceType);

    const activeFilter = [{ code: 'status', operator: Operator.EQUALS, value: 'completed' }];

    // Add the defaul fields to your parsed search definition
    const populatedSearch = {
      ...parsedSearch,
      fields,
      sort,
      filter: currentTab === 'active' ? activeFilter : [],
    };

    console.log(populatedSearch);

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      // If the url matches the parsed search and fields, execute the search
      setSearch(populatedSearch);
    } else {
      // If it doesn't, navigate to the correct URL
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location, currentTab]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Document>
      {search.resourceType === 'Task' ? (
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
              onNew={() => setIsNewOpen(!isNewOpen)}
            />
          </Tabs.Panel>
          <Tabs.Panel value="completed">
            <SearchControl
              search={search}
              onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
              onNew={() => setIsNewOpen(!isNewOpen)}
            />
          </Tabs.Panel>
        </Tabs>
      ) : (
        <SearchControl
          search={search}
          onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
          hideToolbar={true}
        />
      )}
      <CreateTaskModal opened={isNewOpen} onClose={() => setIsNewOpen(!isNewOpen)} />
    </Document>
  );
}

// Get the default fields for a given resource type
function getDefaultFields(resourceType: string): string[] {
  const fields = ['id', '_lastUpdated'];

  switch (resourceType) {
    case 'Patient':
      fields.push('name', 'birthdate', 'gender');
      break;
    case 'Task':
      fields.push('priority', 'description', 'for', 'status');
      break;
  }

  return fields;
}

function getDefaultSort(resourceType: string): SortRule[] {
  const defaultSort = [{ code: '-_lastUpdated' }];

  switch (resourceType) {
    case 'Task':
      defaultSort[0] = { code: '-priority-order' };
  }

  return defaultSort;
}
