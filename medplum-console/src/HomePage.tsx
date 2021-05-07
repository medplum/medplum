import { Button, SearchControl } from 'medplum-ui';
import React from 'react';
import { history } from './history';

export function HomePage() {
  return (
    <>
      <div style={{ padding: '0 0 4px 4px' }}>
        <Button size="small">Fields</Button>
        <Button size="small">Filters</Button>
        <Button size="small">Export</Button>
      </div>
      <SearchControl
        checkboxesEnabled={true}
        search={{
          resourceType: 'Patient'
        }}
        onClick={e => history.push(`/${e.resource.resourceType}/${e.resource.id}`)}
      />
    </>
  );
}
