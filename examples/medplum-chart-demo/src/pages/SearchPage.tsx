import { Paper } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Filter, formatSearchQuery, parseSearchRequest, SearchRequest, SortRule } from '@medplum/core';
import { UserConfiguration } from '@medplum/fhirtypes';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateEncounter } from '../components/actions/CreateEncounter';
import classes from './SearchPage.module.css';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();
  const [opened, handlers] = useDisclosure(false);

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);

    if (!parsedSearch.resourceType) {
      // If there is no search, go to the Encounter search page by default
      navigate('/Encounter');
      return;
    }

    // Populate the search with default values as necessary
    const populatedSearch = addSearchValues(parsedSearch, medplum.getUserConfiguration());

    if (
      // If the current url matches the search, set the search, otherwise navigate to the correct url
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      saveLastSearch(populatedSearch);
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs" className={classes.paper}>
      <CreateEncounter opened={opened} handlers={handlers} />
      <SearchControl
        checkboxesEnabled={false}
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
        hideFilters={true}
        hideToolbar={search.resourceType !== 'Encounter'}
        onNew={handlers.open}
      />
    </Paper>
  );
}

function addSearchValues(search: SearchRequest, config: UserConfiguration | undefined): SearchRequest {
  const resourceType = search.resourceType || getDefaultResourceType(config);
  const fields = search.fields ?? getDefaultFields(search.resourceType);
  const filters = search.filters ?? (!search.resourceType ? getDefaultFilters(resourceType) : undefined);
  const sortRules = search.sortRules ?? getDefaultSortRules(resourceType);

  return {
    ...search,
    resourceType,
    fields,
    filters,
    sortRules,
  };
}

function getDefaultResourceType(config: UserConfiguration | undefined): string {
  return (
    localStorage.getItem('defaultResourceType') ??
    config?.option?.find((o) => o.id === 'defaultResourceType')?.valueString ??
    'Task'
  );
}

function getDefaultFilters(resourceType: string): Filter[] | undefined {
  return getLastSearch(resourceType)?.filters;
}

function getDefaultSortRules(resourceType: string): SortRule[] {
  const lastSearch = getLastSearch(resourceType);
  if (lastSearch?.sortRules) {
    return lastSearch.sortRules;
  }
  return [{ code: '_lastUpdated', descending: true }];
}

function getLastSearch(resourceType: string): SearchRequest | undefined {
  const value = localStorage.getItem(resourceType + '-defaultSearch');
  return value ? (JSON.parse(value) as SearchRequest) : undefined;
}

function saveLastSearch(search: SearchRequest): void {
  localStorage.setItem('defaultResourceType', search.resourceType);
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}

function getDefaultFields(resourceType: string): string[] {
  switch (resourceType) {
    case 'Encounter':
      return ['class', 'type', 'subject', 'period'];
    case 'Patient':
      return ['name', 'gender', 'birthDate', '_lastUpdated'];
    case 'Practitioner':
      return ['name', '_lastUpdated'];
    default:
      return ['_id', '_lastUpdated'];
  }
}
