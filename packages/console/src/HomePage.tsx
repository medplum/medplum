import { formatSearchQuery, parseSearchDefinition } from '@medplum/core';
import { Button, SearchControl } from '@medplum/ui';
import React from 'react';
import { useLocation } from 'react-router';
import { history } from './history';

export function HomePage() {
  const location = useLocation();
  const search = parseSearchDefinition(location);

  if (!search.resourceType) {
    search.resourceType = 'Patient';
  }

  return (
    <>
      <div style={{ background: 'white', padding: '2px 0 4px 4px' }}>
        <Button size="small">Fields</Button>
        <Button size="small">Filters</Button>
        <Button size="small">Export</Button>
        <Button size="small" onClick={() => history.push(`/${search.resourceType}/new`)}>New...</Button>
      </div>
      <SearchControl
        checkboxesEnabled={true}
        search={search}
        onClick={e => history.push(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={e => history.push({
          pathname: `/${e.definition.resourceType}`,
          search: formatSearchQuery(e.definition)
        })}
      />
    </>
  );
}
