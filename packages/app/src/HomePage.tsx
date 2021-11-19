import { formatSearchQuery, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Loading, SearchControl } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>(parseSearchDefinition(location));

  useEffect(() => {
    const parsedSearch = parseSearchDefinition(location);

    if (parsedSearch.resourceType && parsedSearch.fields && parsedSearch.fields.length > 0) {
      // If the URL has a resourceType and fields,
      // use that
      setDefaultResourceType(parsedSearch.resourceType);
      setDefaultSearchForResourceType(parsedSearch);
      setSearch(parsedSearch);

    } else if (parsedSearch.resourceType) {
      // If the URL has a resourceType but no fields,
      // use the default search for that resourceType
      setDefaultResourceType(parsedSearch.resourceType);
      setSearch(getDefaultSearchForResourceType(parsedSearch.resourceType));

    } else {
      // Otherwise, use the default search
      setSearch(getDefaultSearch());
    }

  }, [location]);

  if (!search.resourceType) {
    return <Loading />;
  }

  return (
    <SearchControl
      checkboxesEnabled={true}
      search={search}
      onClick={e => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onChange={e => {
        if (e.definition.resourceType && e.definition.fields && e.definition.fields.length > 0) {
          navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
        }
      }}
    />
  );
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
    case 'ClientApplication':
    case 'Practitioner':
    case 'Project':
    case 'Organization':
    case 'Questionnaire':
      fields.push('name');
      break;
    case 'DiagnosticReport':
    case 'Encounter':
    case 'Observation':
      fields.push('subject');
      break;
    case 'ServiceRequest':
      fields.push('subject', 'code', 'status', 'orderDetail');
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
    }],
    page: 0,
    count: 20
  };
}

function setDefaultSearchForResourceType(search: SearchRequest): void {
  localStorage.setItem(search.resourceType + '-defaultSearch', JSON.stringify(search));
}
