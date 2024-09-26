import { Paper } from '@mantine/core';
import {
  DEFAULT_SEARCH_COUNT,
  Filter,
  formatSearchQuery,
  isReference,
  parseSearchRequest,
  SearchRequest,
  SortRule,
} from '@medplum/core';
import { Patient, Reference, Resource, UserConfiguration } from '@medplum/fhirtypes';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useResourceType } from './resource/useResourceType';
import classes from './SearchPage.module.css';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);

    const populatedSearch = addSearchValues(parsedSearch, medplum.getUserConfiguration());

    if (
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      saveLastSearch(populatedSearch);
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`);
    }
  }, [medplum, navigate, location]);

  useResourceType(search?.resourceType, { onInvalidResourceType: () => navigate('..') });

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs" className={classes.paper}>
      <SearchControl
        checkboxesEnabled={true}
        search={search}
        onClick={(e) => navigate(getResourceUrl(e.resource))}
        onAuxClick={(e) => window.open(getResourceUrl(e.resource), '_blank')}
        onNew={() => {
          navigate(`/${search.resourceType}/new`);
        }}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }}
      />
    </Paper>
  );
}

function addSearchValues(search: SearchRequest, config: UserConfiguration | undefined): SearchRequest {
  const resourceType = search.resourceType || getDefaultResourceType(config);
  const fields = search.fields ?? ['_id', '_lastUpdated'];
  const filters = search.filters ?? (!search.resourceType ? getDefaultFilters(resourceType) : undefined);
  const sortRules = search.sortRules ?? getDefaultSortRules(resourceType);
  const offset = search.offset ?? 0;
  const count = search.count ?? DEFAULT_SEARCH_COUNT;

  return {
    ...search,
    resourceType,
    fields,
    filters,
    sortRules,
    offset,
    count,
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

function getResourceUrl<T extends Resource>(resource: T): string {
  const patientFields = ['patient', 'subject', 'sender'] as (keyof T)[];
  for (const key of patientFields) {
    if (key in resource) {
      const value = resource[key];
      if (isPatientReference(value)) {
        return `/${value.reference}/${resource.resourceType}/${resource.id}`;
      }
    }
  }
  return `/${resource.resourceType}/${resource.id}`;
}

function isPatientReference(input: unknown): input is Reference<Patient> & { reference: string } {
  return isReference(input) && input.reference.startsWith('Patient/');
}
