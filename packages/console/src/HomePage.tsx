import { formatSearchQuery, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Loading, SearchControl } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { history } from './history';

export function HomePage() {
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>(parseSearchDefinition(location));

  useEffect(() => {
    setSearch(parseSearchDefinition(location));
  }, [location]);

  useEffect(() => {
    if (!search.resourceType) {
      goToSearch({ ...search, resourceType: 'Patient' });
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
