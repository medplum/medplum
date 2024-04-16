import { Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatSearchQuery, getReferenceString, Operator, parseSearchRequest, SearchRequest } from '@medplum/core';
import { Document, Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateThread } from '../components/actions/CreateThread';
import { getPopulatedSearch } from '../utils';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();
  const [opened, handlers] = useDisclosure(false);

  // Only show the active and complete tabs when viewing Communication resources
  const [showTabs, setShowTabs] = useState<boolean>(() => {
    const search = parseSearchRequest(location.pathname + location.search);
    return shouldShowTabs(search);
  });

  const tabs = ['Active', 'Completed'];
  const searchQuery = window.location.search;
  const currentSearch = searchQuery ? parseSearchRequest(searchQuery) : null;
  const currentTab = currentSearch ? handleInitialTab(currentSearch) : null;

  useEffect(() => {
    const searchQuery = parseSearchRequest(location.pathname + location.search);
    setShowTabs(shouldShowTabs(searchQuery));
  }, [location]);

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    // Navigate to view Communication resources by default
    if (!parsedSearch.resourceType) {
      navigate('/Communication');
      return;
    }

    // Populate the search with details for a given resource type
    const populatedSearch = getPopulatedSearch(parsedSearch);

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      // If you are alrady at the correct url, execute the search
      setSearch(populatedSearch);
    } else {
      // Otherwise, navigate to the correct url before executing
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  function handleTabChange(newTab: string | null): void {
    if (!search) {
      throw new Error('Error: No valid search');
    }

    const updatedSearch = updateSearch(newTab ?? 'active', search);
    const updatedSearchQuery = formatSearchQuery(updatedSearch);
    navigate(`/Communication${updatedSearchQuery}`);
  }

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Document>
      <CreateThread opened={opened} handlers={handlers} />
      {showTabs ? (
        <Tabs value={currentTab?.toLowerCase()} onChange={handleTabChange}>
          <Tabs.List>
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
              hideToolbar={false}
              onNew={handlers.open}
              onChange={(e) => {
                navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
              }}
            />
          </Tabs.Panel>
          <Tabs.Panel value="completed">
            <SearchControl
              search={search}
              onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
              hideFilters={true}
              hideToolbar={false}
              onNew={handlers.open}
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
          hideFilters={true}
          hideToolbar={true}
        />
      )}
    </Document>
  );
}

function handleInitialTab(currentSearch: SearchRequest): string {
  if (!currentSearch.filters) {
    return 'active';
  }

  for (const filter of currentSearch.filters) {
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

function shouldShowTabs(search: SearchRequest): boolean {
  if (search.resourceType !== 'Communication') {
    return false;
  }

  return true;
}
