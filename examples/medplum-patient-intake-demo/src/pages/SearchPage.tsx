// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper } from '@mantine/core';
import { formatSearchQuery, parseSearchRequest } from '@medplum/core';
import type { SearchRequest, SortRule } from '@medplum/core';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import classes from './SearchPage.module.css';

export function SearchPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);

    // Populate the search with default values as necessary
    const populatedSearch = addSearchValues(parsedSearch);

    if (
      // If the current url matches the search, set the search, otherwise navigate to the correct url
      location.pathname === `/${populatedSearch.resourceType}` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      saveLastSearch(populatedSearch);
      setSearch(populatedSearch);
    } else {
      navigate(`/${populatedSearch.resourceType}${formatSearchQuery(populatedSearch)}`)?.catch(console.error);
    }
  }, [medplum, navigate, location]);

  if (!search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs" className={classes.paper}>
      <SearchControl
        checkboxesEnabled={false}
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
        onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onChange={(e) => {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`)?.catch(console.error);
        }}
        hideFilters={true}
        hideToolbar
      />
    </Paper>
  );
}

function addSearchValues(search: SearchRequest): SearchRequest {
  const resourceType = search.resourceType;
  const fields = search.fields ?? getDefaultFields(search.resourceType);
  const filters = search.filters;
  const sortRules = search.sortRules ?? getDefaultSortRules(resourceType);

  return {
    ...search,
    resourceType,
    fields,
    filters,
    sortRules,
  };
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
    case 'Patient':
      return ['name', 'gender', 'birthDate', '_lastUpdated'];
    case 'Practitioner':
      return ['name', '_lastUpdated'];
    case 'QuestionnaireResponse':
      return ['_id', 'questionnaire', 'author', '_lastUpdated'];
    default:
      return ['_id', '_lastUpdated'];
  }
}
