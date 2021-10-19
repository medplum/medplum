import { formatSearchQuery, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Loading, SearchControl } from '@medplum/ui';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { history } from './history';

export function HomePage() {
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>(parseSearchDefinition(location));

  const searchRef = useRef<SearchRequest>();
  searchRef.current = search;

  useEffect(() => {
    const parsedSearch = parseSearchDefinition(location);
    if (parsedSearch.resourceType) {
      setDefaultResourceType(parsedSearch.resourceType);
      if (parsedSearch.fields && parsedSearch.fields.length > 0) {
        setDefaultSearchForResourceType(parsedSearch);
      }
    }
    setSearch(parsedSearch);
  }, [location]);

  useEffect(() => {
    if (!search.resourceType) {
      goToSearch(getDefaultSearch());
    }
    if (!search.fields || search.fields.length === 0) {
      goToSearch(getDefaultSearchForResourceType(search.resourceType));
    }
  }, [search]);

  if (!search.resourceType) {
    return <Loading />;
  }

  return (
    <SearchControl
      checkboxesEnabled={true}
      search={search}
      onClick={e => history.push(`/${e.resource.resourceType}/${e.resource.id}`)}
      onChange={e => goToSearch(e.definition)}
    />
  );
}

function goToSearch(search: SearchRequest): void {
  history.push({
    pathname: `/${search.resourceType}`,
    search: formatSearchQuery(search)
  });
}

function getDefaultSearch(): SearchRequest {
  return getDefaultSearchForResourceType(getDefaultResourceType());
}

function getDefaultResourceType(): string {
  return localStorage.getItem('defaultResourceType') || 'Patient';
}

function setDefaultResourceType(resourceType: string): void {
  if (resourceType) {
    localStorage.setItem('defaultResourceType', resourceType);
  }
}

export function getDefaultSearchForResourceType(resourceType: string): SearchRequest {
  const value = localStorage.getItem(resourceType + '-defaultSearch');
  if (value) {
    return JSON.parse(value) as SearchRequest;
  }
  const fields = ['id', '_lastUpdated'];
  switch (resourceType) {
    case 'Patient':
      fields.push('name', 'birthDate', 'gender');
      break;
    case 'AccessPolicy':
    case 'Practitioner':
    case 'Project':
    case 'Organization':
    case 'Questionnaire':
      fields.push('name');
      break;
    case 'DiagnosticReport':
    case 'Encounter':
    case 'Observation':
    case 'ServiceRequest':
      fields.push('subject');
      break;
    case 'Subscription':
      fields.push('criteria');
      break;
  }
  return {
    resourceType,
    fields,
    sortRules: [{
      code: '_lastUpdated',
      descending: true
    }]
  };
}

function setDefaultSearchForResourceType(search: SearchRequest): void {
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}
