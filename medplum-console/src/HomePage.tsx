import { Button, SearchControl } from 'medplum-ui';
import React from 'react';
import { useParams } from 'react-router';
import { history } from './history';

export function HomePage() {
  const { resourceType } = useParams() as any;
  console.log('resourceType', resourceType);
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
          resourceType: resourceType || 'Patient'
        }}
        onClick={e => history.push(`/${e.resource.resourceType}/${e.resource.id}`)}
      />
    </>
  );
}
