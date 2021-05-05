import { SearchControl } from 'medplum-ui';
import React from 'react';
import { history } from './history';

export function HomePage() {
  return (
    <SearchControl
      checkboxesEnabled={true}
      search={{
        resourceType: 'Patient'
      }}
      onClick={e => history.push(`/${e.resource.resourceType}/${e.resource.id}`)}
    />
  );
}
