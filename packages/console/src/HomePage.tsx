import { Bundle, formatSearchQuery, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Button, Loading, movePage, SearchControl } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { history } from './history';

export function HomePage() {
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>(parseSearchDefinition(location));
  const [lastResult, setLastResult] = useState<Bundle | undefined>();

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
    <>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', background: 'white', padding: '2px 4px 4px 4px' }}>
        <div style={{ display: 'flex' }}>
          <Button size="small">Fields</Button>
          <Button size="small">Filters</Button>
          <Button size="small">Export</Button>
          <Button
            testid="new-button"
            size="small"
            onClick={() => history.push(`/${search.resourceType}/new`)}
          >New...</Button>
        </div>
        {lastResult && (
          <div style={{ display: 'flex' }}>
            <span style={{ lineHeight: '28px', padding: '2px 6px', fontSize: '12px' }}>
              {getStart(search)}-{getEnd(search)} of {lastResult.total}
            </span>
            <Button
              testid="prev-page-button"
              size="small"
              onClick={() => goToSearch(movePage(search, -1))}
            >&lt;&lt;</Button>
            <Button
              testid="next-page-button"
              size="small"
              onClick={() => goToSearch(movePage(search, 1))}
            >&gt;&gt;</Button>
          </div>
        )}
      </div>
      <SearchControl
        checkboxesEnabled={true}
        search={search}
        onClick={e => history.push(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={e => goToSearch(e.definition)}
        onLoad={e => setLastResult(e.response)}
      />
    </>
  );
}

function goToSearch(search: SearchRequest): void {
  history.push({
    pathname: `/${search.resourceType}`,
    search: formatSearchQuery(search)
  });
}

function getStart(search: SearchRequest): number {
  return (search.page ?? 0) * (search.count ?? 10) + 1;
}

function getEnd(search: SearchRequest): number {
  return ((search.page ?? 0) + 1) * (search.count ?? 10);
}
