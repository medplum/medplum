import { SearchRequest } from '@medplum/core';
import { Meta } from '@storybook/react';
import React, { useState } from 'react';
import { SearchControl } from '../SearchControl';

export default {
  title: 'Medplum/SearchControl',
  component: SearchControl,
} as Meta;

export const Checkboxes = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const NoCheckboxes = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name'],
  });

  return (
    <SearchControl
      search={search}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const ExtraFields = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name', 'birthDate', 'active', 'telecom', 'email', 'phone'],
  });

  return (
    <SearchControl
      search={search}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};

export const ServiceRequests = (): JSX.Element => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'ServiceRequest',
    fields: ['id', '_lastUpdated', 'subject', 'code', 'status', 'orderDetail'],
  });

  return (
    <SearchControl
      search={search}
      checkboxesEnabled={true}
      onLoad={(e) => console.log('onLoad', e)}
      onClick={(e) => console.log('onClick', e)}
      onChange={(e) => {
        console.log('onChange', e);
        setSearch(e.definition);
      }}
    />
  );
};
