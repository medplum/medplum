import { SearchRequest } from '@medplum/core';
import { Meta } from '@storybook/react';
import React, { useState } from 'react';
import { SearchControl } from '../SearchControl';

export default {
  title: 'Medplum/SearchControl',
  component: SearchControl,
} as Meta;

export const Checkboxes = () => {
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

export const NoCheckboxes = () => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
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

export const ExtraFields = () => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Patient',
    fields: ['id', '_lastUpdated', 'name', 'birthDate'],
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

export const ServiceRequests = () => {
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

export const DeviceDefinitions = () => {
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'DeviceDefinition',
    fields: ['id', '_lastUpdated', 'manufacturer[x]', 'deviceName'],
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
