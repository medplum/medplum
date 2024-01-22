import { Tabs } from '@mantine/core';
import { formatSearchQuery, getReferenceString, Operator, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Document, Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateTaskModal } from '../components/actions/CreateTaskModal';
import { getPopulatedSearch } from './utils';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);

  const [showTabs, setShowTabs] = useState<boolean>(() => {
    const search = parseSearchDefinition(window.location.pathname + window.location.search);
    return shouldShowTabs(search);
  });

  const tabs = ['Active', 'Completed'];
  const searchQuery = window.location.search;
  const currentSearch = parseSearchDefinition(searchQuery);

  const currentTab = handleInitialTab(currentSearch);

  useEffect(() => {
    const searchQuery = parseSearchDefinition(location.pathname + location.search);
    setShowTabs(shouldShowTabs(searchQuery));
  }, [location]);

  useEffect(() => {
    // Parse the search definition from the url and get the correct fields for the resource type
    const parsedSearch = parseSearchDefinition(location.pathname + location.search);
    if (!parsedSearch.resourceType) {
      navigate('/Task');
      return;
    }

    const populatedSearch = getPopulatedSearch(parsedSearch);

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
  }, [medplum, navigate, location]);

  const handleTabChange = (newTab: string | null): void => {
    if (!search) {
      throw new Error('Error: No valid search');
    }

    const updatedSearch = updateSearch(newTab ?? 'active', search);
    const updatedSearchQuery = formatSearchQuery(updatedSearch);
    navigate(`/Task${updatedSearchQuery}`);
  };

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Document>
      {showTabs ? (
        <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
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
              hideToolbar={false}
              onNew={() => setIsNewOpen(true)}
              hideFilters={true}
              onChange={(e) => {
                navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
              }}
            />
          </Tabs.Panel>
          <Tabs.Panel value="completed">
            <SearchControl
              search={search}
              onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
              hideToolbar={false}
              onNew={() => setIsNewOpen(true)}
              hideFilters={true}
              onChange={(e) => {
                navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
              }}
            />
          </Tabs.Panel>
        </Tabs>
      ) : (
        <SearchControl
          search={search}
          onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
          hideToolbar={true}
          hideFilters={true}
          onChange={(e) => {
            navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
          }}
        />
      )}
      <CreateTaskModal opened={isNewOpen} onClose={() => setIsNewOpen(!isNewOpen)} />
    </Document>
  );
}

function handleInitialTab(search: SearchRequest): string {
  if (!search?.filters) {
    return 'active';
  }

  for (const filter of search.filters) {
    if (filter.value === 'completed') {
      const tab = filter.operator;
      if (tab === Operator.NOT) {
        return 'active';
      } else {
        return 'completed';
      }
    }
  }
  return 'active';
}

function shouldShowTabs(search: SearchRequest): boolean {
  if (search.resourceType !== 'Task') {
    return false;
  }

  if (!search.filters) {
    return true;
  }

  for (const filter of search.filters) {
    if (filter.code === 'performer') {
      return false;
    }
  }

  return true;
}

function updateSearch(newTab: string, search: SearchRequest): SearchRequest {
  const filters = search.filters || [];
  const newCode = newTab === 'active' ? 'status:not' : 'status';

  if (filters.length === 0) {
    filters.push({ code: newCode, operator: Operator.EQUALS, value: 'completed' });
  } else {
    for (const filter of filters) {
      if (filter.value === 'completed') {
        filter.code = newCode;
        filter.operator = Operator.EQUALS;
      }
    }
  }

  return {
    ...search,
    filters,
  };
}
