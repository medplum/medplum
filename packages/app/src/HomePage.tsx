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
    setSearch(parseSearchDefinition(location));
  }, [location]);

  useEffect(() => {
    if (!search.resourceType) {
      goToSearch(getDefaultSearch());
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
  setDefaultSearch(search);
  history.push({
    pathname: `/${search.resourceType}`,
    search: formatSearchQuery(search)
  });
}

function setDefaultSearch(search: SearchRequest): void {
  localStorage.setItem('defaultSearch', JSON.stringify(search));
}

function getDefaultSearch(): SearchRequest {
  const value = localStorage.getItem('medplum-default-search');
  if (value) {
    return JSON.parse(value) as SearchRequest;
  }
  return { resourceType: 'Patient' };
}
